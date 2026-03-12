import {
  createEnvelope,
  FramieEnvelope,
  generateId,
  HandshakeError,
  HandshakePayload,
  HELLO_EVENT,
  isFramieEnvelope,
  PROTOCOL_VERSION,
  READY_EVENT,
  SDK_VERSION,
} from "./protocol";

export type ChannelHandler<T = unknown> = (payload: T) => void;
export type RequestHandler<T = unknown, R = unknown> = (payload: T) => R | Promise<R>;

export interface FramieChannelOptions {
  targetOrigin: string;
  /**
   * Your package sdkVersion string (e.g. "0.1.0").
   * Sent in the hello handshake and validated against the peer's version.
   * Defaults to the built-in SDK_VERSION constant.
   */
  sdkVersion?: string;
  /**
   * Called when a handshake reveals incompatible protocol versions.
   * The queue is NOT flushed on mismatch — the channel stays blocked.
   * Destroy the widget inside this callback to release resources.
   */
  onError?: (error: HandshakeError) => void;
}

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
  cleanup: () => void;
}

export interface RequestOptions {
  /** Reject after this many ms. Default: 5000. */
  timeoutMs?: number;
  /** Cancel the pending request immediately when this signal fires. */
  signal?: AbortSignal;
}

/**
 * Host-side message channel between the parent page and the Framie iframe.
 *
 * Security guarantees:
 * - Outgoing messages are targeted to `targetOrigin`.
 * - Incoming messages are accepted only when `event.origin === targetOrigin`
 *   AND `event.source === iframe.contentWindow`.
 * - Non-Framie messages (missing `__framie` marker) are silently ignored.
 */
export class FramieChannel {
  private readonly targetOrigin: string;
  private readonly sdkVersion: string;
  private readonly _onError: ((error: HandshakeError) => void) | undefined;

  private iframeRef: HTMLIFrameElement | null = null;
  private _onIframeLoad: (() => void) | null = null;
  private _isReady = false;
  private readonly _queue: FramieEnvelope[] = [];
  private readonly _listeners = new Map<string, Set<ChannelHandler>>();
  private readonly _requestHandlers = new Map<string, RequestHandler>();
  private readonly _pending = new Map<string, PendingRequest>();
  private readonly _onMessage: (e: MessageEvent) => void;
  private _isDestroyed = false;

  /**
   * @param options - Either a plain `targetOrigin` string (backward-compat) or a
   *   `FramieChannelOptions` object for full handshake + error handling.
   */
  constructor(options: FramieChannelOptions | string) {
    if (typeof options === "string") {
      this.targetOrigin = options;
      this.sdkVersion = SDK_VERSION;
      this._onError = undefined;
    } else {
      this.targetOrigin = options.targetOrigin;
      this.sdkVersion = options.sdkVersion ?? SDK_VERSION;
      this._onError = options.onError;
    }
    this._onMessage = this._handleMessage.bind(this);
    window.addEventListener("message", this._onMessage);
  }

  get isReady(): boolean {
    return this._isReady;
  }

  /**
   * Bind this channel to a specific iframe element.
   * A `__framie:hello` envelope carrying version info is sent automatically
   * when the iframe's `load` event fires, initiating the handshake.
   */
  attach(iframe: HTMLIFrameElement): void {
    // Remove any previous load listener so re-attach is safe.
    if (this._onIframeLoad && this.iframeRef) {
      this.iframeRef.removeEventListener("load", this._onIframeLoad);
    }
    this.iframeRef = iframe;
    this._isReady = false;

    this._onIframeLoad = () => {
      // Send hello directly (bypass queue — this is the handshake initiation).
      this._post(
        createEnvelope<HandshakePayload>(HELLO_EVENT, {
          sdkVersion: this.sdkVersion,
          protocolVersion: PROTOCOL_VERSION,
        }),
      );
    };
    iframe.addEventListener("load", this._onIframeLoad);
  }

  /** Unbind the iframe, reject all pending requests, clear the queue. */
  detach(): void {
    if (this._onIframeLoad && this.iframeRef) {
      this.iframeRef.removeEventListener("load", this._onIframeLoad);
      this._onIframeLoad = null;
    }
    this.iframeRef = null;
    this._isReady = false;
    this._rejectAll("Framie: channel detached");
    this._queue.length = 0;
  }

  /** Permanently shut down the channel — removes the message listener. */
  destroy(): void {
    this._isDestroyed = true;
    this.detach();
    window.removeEventListener("message", this._onMessage);
    this._listeners.clear();
    this._requestHandlers.clear();
  }

  /**
   * Fire-and-forget message to the peer.
   * Buffered until the peer signals ready; then flushed in order.
   */
  send<T>(type: string, payload?: T): void {
    if (this._isDestroyed) return;
    this._enqueue(createEnvelope(type, payload));
  }

  /**
   * Send a typed request to the peer and await a response.
   * Rejects with a timeout error if the peer does not reply within `timeoutMs`.
   */
  /**
   * Send a typed request to the peer and await a typed response.
   *
   * - `options.timeoutMs` — reject after N ms (default 5000).
   * - `options.signal`    — reject immediately when the AbortSignal fires.
   *
   * The `requestId` correlation header lives at the envelope level and is
   * never merged into `payload`, so payload types stay clean.
   */
  request<R = unknown>(type: string, payload?: unknown, options?: RequestOptions): Promise<R> {
    if (this._isDestroyed) return Promise.reject(new Error("Framie: channel is destroyed"));

    const signal = options?.signal;
    if (signal?.aborted) {
      return Promise.reject(signal.reason ?? new DOMException("Aborted", "AbortError"));
    }

    return new Promise<R>((resolve, reject) => {
      const requestId = generateId();
      const timeoutMs = options?.timeoutMs ?? 5000;
      let onAbort: (() => void) | undefined;

      const cleanup = () => {
        if (onAbort) signal?.removeEventListener("abort", onAbort);
      };

      const timer = setTimeout(() => {
        cleanup();
        this._pending.delete(requestId);
        reject(new Error(`Framie: request "${type}" timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      if (signal) {
        onAbort = () => {
          clearTimeout(timer);
          cleanup();
          this._pending.delete(requestId);
          reject(signal.reason ?? new DOMException("Aborted", "AbortError"));
        };
        signal.addEventListener("abort", onAbort, { once: true });
      }

      this._pending.set(requestId, {
        resolve: resolve as (v: unknown) => void,
        reject,
        timer,
        cleanup,
      });

      // requestId lives at envelope level — payload type stays clean
      this._enqueue(createEnvelope(type, payload, { requestId }));
    });
  }

  /** Subscribe to a regular (non-request) message from the peer. */
  on<T = unknown>(type: string, handler: ChannelHandler<T>): () => void {
    if (!this._listeners.has(type)) this._listeners.set(type, new Set());
    this._listeners.get(type)!.add(handler as ChannelHandler);
    return () => this.off(type, handler);
  }

  off<T = unknown>(type: string, handler: ChannelHandler<T>): void {
    this._listeners.get(type)?.delete(handler as ChannelHandler);
  }

  /**
   * Register a handler for peer-initiated requests.
   * The return value (or resolved Promise) is sent back as the response.
   */
  onRequest<T = unknown, R = unknown>(type: string, handler: RequestHandler<T, R>): () => void {
    this._requestHandlers.set(type, handler as RequestHandler);
    return () => this._requestHandlers.delete(type);
  }

  private _handleMessage(event: MessageEvent): void {
    if (this._isDestroyed) return;

    // Origin check
    if (event.origin !== this.targetOrigin) return;
    // Source check — must come from our exact iframe
    if (!this.iframeRef || event.source !== this.iframeRef.contentWindow) return;
    // Envelope check
    if (!isFramieEnvelope(event.data)) return;

    const msg = event.data as FramieEnvelope;

    // Peer ready signal → validate version, then flush queue
    if (msg.type === READY_EVENT) {
      const payload = msg.payload as Partial<HandshakePayload> | undefined;
      if (payload?.protocolVersion !== undefined && payload.protocolVersion !== PROTOCOL_VERSION) {
        const err = new HandshakeError(
          `Framie: protocol version mismatch — host v${PROTOCOL_VERSION}, peer v${payload.protocolVersion}. ` +
            `Update both @framie/core and @framie/peer to compatible versions.`,
        );
        this._onError?.(err);
        // Do NOT flush — the peer is incompatible.
        return;
      }
      this._isReady = true;
      this._flush();
      return;
    }

    // Response to a host-initiated request
    if (msg.isResponse && msg.requestId) {
      const pending = this._pending.get(msg.requestId);
      if (pending) {
        clearTimeout(pending.timer);
        pending.cleanup();
        this._pending.delete(msg.requestId);
        if (msg.error) {
          pending.reject(new Error(msg.error));
        } else {
          pending.resolve(msg.payload);
        }
      }
      return;
    }

    // Peer-initiated request (has requestId but isResponse is falsy)
    if (msg.requestId) {
      const handler = this._requestHandlers.get(msg.type);
      const respond = (result?: unknown, error?: string) =>
        this._post(createEnvelope(msg.type, result, { requestId: msg.requestId, isResponse: true, error }));

      if (handler) {
        Promise.resolve()
          .then(() => handler(msg.payload))
          .then((result) => respond(result))
          .catch((err: unknown) => respond(undefined, err instanceof Error ? err.message : String(err)));
      } else {
        respond(undefined, `Framie: no handler registered for "${msg.type}"`);
      }
      return;
    }

    // Regular event
    this._listeners.get(msg.type)?.forEach((h) => h(msg.payload));
  }

  private _enqueue(envelope: FramieEnvelope): void {
    if (this._isReady) this._post(envelope);
    else this._queue.push(envelope);
  }

  private _flush(): void {
    for (const msg of this._queue.splice(0)) this._post(msg);
  }

  private _post(envelope: FramieEnvelope): void {
    this.iframeRef?.contentWindow?.postMessage(envelope, this.targetOrigin);
  }

  private _rejectAll(reason: string): void {
    for (const [, p] of this._pending) {
      clearTimeout(p.timer);
      p.cleanup();
      p.reject(new Error(reason));
    }
    this._pending.clear();
  }
}

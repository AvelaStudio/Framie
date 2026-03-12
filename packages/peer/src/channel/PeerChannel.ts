import { FramieEnvelope, HandshakeError, HandshakePayload, HELLO_EVENT, PROTOCOL_VERSION, READY_EVENT, SDK_VERSION } from "./protocol";
import { PeerChannelOptions, PeerMessageHandler, PeerRequestHandler, PendingRequest, PeerRequestOptions } from "./types";
import { createEnvelope, generateId, isFramieEnvelope } from "./utils";

/**
 * Peer-side message channel running inside the iframe.
 *
 * Security:
 * - Incoming messages are verified against `allowedOrigin` (unless "*").
 * - Non-Framie messages are ignored.
 * - Outgoing messages go only to `allowedOrigin`.
 */
export class PeerChannel {
  private readonly allowedOrigin: string;
  private readonly defaultTimeout: number;
  private readonly sdkVersion: string;
  private readonly _onError: ((error: Error) => void) | undefined;
  private readonly _listeners = new Map<string, Set<PeerMessageHandler>>();
  private readonly _requestHandlers = new Map<string, PeerRequestHandler>();
  private readonly _pending = new Map<string, PendingRequest>();
  private readonly _onMessage: (e: MessageEvent) => void;
  private _isDestroyed = false;

  constructor(options: PeerChannelOptions) {
    this.allowedOrigin = options.allowedOrigin;
    this.defaultTimeout = options.requestTimeout ?? 5000;
    this.sdkVersion = options.sdkVersion ?? SDK_VERSION;
    this._onError = options.onError;
    this._onMessage = this._handleMessage.bind(this);
    window.addEventListener("message", this._onMessage);
  }

  /**
   * Signal to the host that this peer is loaded and ready to receive messages.
   * Includes version info so the host can validate protocol compatibility.
   */
  ready(): void {
    if (this._isDestroyed) return;
    this._postToParent(
      createEnvelope<HandshakePayload>(READY_EVENT, {
        sdkVersion: this.sdkVersion,
        protocolVersion: PROTOCOL_VERSION,
      }),
    );
  }

  /** Fire-and-forget a message to the host. */
  send<T>(type: string, payload?: T): void {
    if (this._isDestroyed) return;
    this._postToParent(createEnvelope(type, payload));
  }

  /**
   * Send a typed request to the host and await a typed response.
   *
   * - `options.timeoutMs` — reject after N ms (overrides `requestTimeout`).
   * - `options.signal`    — reject immediately when the AbortSignal fires.
   *
   * `requestId` lives at the envelope level; payload types stay clean.
   */
  request<R = unknown>(type: string, payload?: unknown, options?: PeerRequestOptions): Promise<R> {
    if (this._isDestroyed) return Promise.reject(new Error("Framie: peer channel is destroyed"));

    const signal = options?.signal;
    if (signal?.aborted) {
      return Promise.reject(signal.reason ?? new DOMException("Aborted", "AbortError"));
    }

    const timeoutMs = options?.timeoutMs ?? this.defaultTimeout;
    return new Promise<R>((resolve, reject) => {
      const requestId = generateId();
      let onAbort: (() => void) | undefined;

      const cleanup = () => {
        if (onAbort) signal?.removeEventListener("abort", onAbort);
      };

      const timer = setTimeout(() => {
        cleanup();
        this._pending.delete(requestId);
        reject(new Error(`Framie: peer request "${type}" timed out after ${timeoutMs}ms`));
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

      this._pending.set(requestId, { resolve: resolve as (v: unknown) => void, reject, timer, cleanup });

      // requestId lives at envelope level — payload type stays clean
      this._postToParent(createEnvelope(type, payload, { requestId }));
    });
  }

  /** Subscribe to a regular (non-request) message from the host. */
  on<T = unknown>(type: string, handler: PeerMessageHandler<T>): () => void {
    if (!this._listeners.has(type)) this._listeners.set(type, new Set());
    this._listeners.get(type)!.add(handler as PeerMessageHandler);
    return () => this.off(type, handler);
  }

  off<T = unknown>(type: string, handler: PeerMessageHandler<T>): void {
    this._listeners.get(type)?.delete(handler as PeerMessageHandler);
  }

  /**
   * Handle a host-initiated request.
   * Return value (or resolved Promise) is automatically sent back as the response.
   */
  onRequest<T = unknown, R = unknown>(type: string, handler: PeerRequestHandler<T, R>): () => void {
    this._requestHandlers.set(type, handler as PeerRequestHandler);
    return () => this._requestHandlers.delete(type);
  }

  /** Remove all listeners and stop processing messages. */
  destroy(): void {
    this._isDestroyed = true;
    window.removeEventListener("message", this._onMessage);
    this._listeners.clear();
    this._requestHandlers.clear();
    for (const [, p] of this._pending) {
      clearTimeout(p.timer);
      p.cleanup();
      p.reject(new Error("Framie: peer channel destroyed"));
    }
    this._pending.clear();
  }

  private _handleMessage(event: MessageEvent): void {
    if (this._isDestroyed) return;
    if (this.allowedOrigin !== "*" && event.origin !== this.allowedOrigin) return;
    if (!isFramieEnvelope(event.data)) return;

    const msg = event.data as FramieEnvelope;

    // Host hello — validate protocol version, fire onError on mismatch
    if (msg.type === HELLO_EVENT) {
      const payload = msg.payload as Partial<HandshakePayload> | undefined;
      if (payload?.protocolVersion !== undefined && payload.protocolVersion !== PROTOCOL_VERSION) {
        const err = new HandshakeError(
          `Framie: protocol version mismatch — host v${payload.protocolVersion}, peer v${PROTOCOL_VERSION}. ` +
            `Update both @framie/core and @framie/peer to compatible versions.`,
        );
        this._onError?.(err);
      }
      return;
    }

    // Response to our pending request
    if (msg.isResponse && msg.requestId) {
      const pending = this._pending.get(msg.requestId);
      if (pending) {
        clearTimeout(pending.timer);
        pending.cleanup();
        this._pending.delete(msg.requestId);
        if (msg.error) pending.reject(new Error(msg.error));
        else pending.resolve(msg.payload);
      }
      return;
    }

    // Host-initiated request
    if (msg.requestId) {
      const handler = this._requestHandlers.get(msg.type);
      const respond = (result?: unknown, error?: string) =>
        this._postToParent(createEnvelope(msg.type, result, { requestId: msg.requestId, isResponse: true, error }));

      if (handler) {
        Promise.resolve()
          .then(() => handler(msg.payload))
          .then((r) => respond(r))
          .catch((err: unknown) => respond(undefined, err instanceof Error ? err.message : String(err)));
      } else {
        respond(undefined, `Framie: no handler for "${msg.type}"`);
      }
      return;
    }

    // Regular event
    this._listeners.get(msg.type)?.forEach((h) => h(msg.payload));
  }

  private _postToParent(envelope: FramieEnvelope): void {
    window.parent.postMessage(envelope, this.allowedOrigin);
  }
}

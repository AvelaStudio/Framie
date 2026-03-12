// ─── Public types ─────────────────────────────────────────────────────────────

export type PeerMessageHandler<T = unknown> = (payload: T) => void;
export type PeerRequestHandler<T = unknown, R = unknown> = (payload: T) => R | Promise<R>;

/** @deprecated Use PeerMessageHandler */
export type PeerHandler<T = unknown> = PeerMessageHandler<T>;

export interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
  cleanup: () => void;
}

export interface PeerRequestOptions {
  /** Reject after this many ms. Default: `PeerChannelOptions.requestTimeout` (5000). */
  timeoutMs?: number;
  /** Cancel immediately when this AbortSignal fires. */
  signal?: AbortSignal;
}

export interface PeerChannelOptions {
  /**
   * Expected origin of the host frame.
   * Incoming messages from other origins are silently dropped.
   * Outgoing messages are targeted to this origin.
   * Use "*" only when the host origin is unknown (not recommended in production).
   */
  allowedOrigin: string;
  /** Default timeout for request() in milliseconds. Default: 5000. */
  requestTimeout?: number;
  /**
   * Your package sdkVersion string (e.g. "0.1.0").
   * Sent in the ready handshake payload and validated against the host's version.
   * Defaults to the built-in SDK_VERSION constant.
   */
  sdkVersion?: string;
  /**
   * Called when the host sends a `__framie:hello` with an incompatible
   * `protocolVersion`. The peer can continue or call any cleanup logic here.
   */
  onError?: (error: Error) => void;
}

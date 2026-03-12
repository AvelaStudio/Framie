/** Discriminator field on every Framie postMessage envelope — lets both sides
 *  ignore non-Framie messages without false positives. */
export const FRAMIE_MARKER = "__framie" as const;

/** Sent by the host to the iframe as the first step of the handshake. */
export const HELLO_EVENT = "__framie:hello" as const;

/** Sent by the peer to the host to complete the handshake and unblock the queue. */
export const READY_EVENT = "__framie:ready" as const;

/** Wire protocol version. Increment on breaking envelope changes. */
export const PROTOCOL_VERSION = 1;

/** Library version embedded in handshake messages. */
export const SDK_VERSION = "0.1.0";

/** Payload carried by both hello and ready messages. */
export interface HandshakePayload {
  sdkVersion: string;
  protocolVersion: number;
}

/** Thrown when the handshake reveals incompatible protocol versions. */
export class HandshakeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HandshakeError";
  }
}

export interface FramieEnvelope<T = unknown> {
  [FRAMIE_MARKER]: true;
  type: string;
  payload?: T;
  /** Correlation ID present on request/response pairs. */
  requestId?: string;
  /** True when this envelope is a response to a request. */
  isResponse?: boolean;
  /** Error message carried back in a failed response. */
  error?: string;
}

export function isFramieEnvelope(data: unknown): data is FramieEnvelope {
  return (
    typeof data === "object" &&
    data !== null &&
    (data as Record<string, unknown>)[FRAMIE_MARKER] === true &&
    typeof (data as Record<string, unknown>).type === "string"
  );
}

export function createEnvelope<T>(
  type: string,
  payload?: T,
  extra?: Partial<Pick<FramieEnvelope, "requestId" | "isResponse" | "error">>,
): FramieEnvelope<T> {
  return { [FRAMIE_MARKER]: true, type, payload, ...extra };
}

export function generateId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

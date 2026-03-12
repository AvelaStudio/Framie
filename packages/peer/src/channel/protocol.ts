// ─── Shared protocol (mirrors @framie/core/channel/protocol) ─────────────────
// Duplicated here to keep @framie/peer dependency-free.

export const FRAMIE_MARKER = "__framie" as const;
export const HELLO_EVENT = "__framie:hello" as const;
export const READY_EVENT = "__framie:ready" as const;
export const PROTOCOL_VERSION = 1;
export const SDK_VERSION = "0.1.0";

export interface HandshakePayload {
  sdkVersion: string;
  protocolVersion: number;
}

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
  requestId?: string;
  isResponse?: boolean;
  error?: string;
}

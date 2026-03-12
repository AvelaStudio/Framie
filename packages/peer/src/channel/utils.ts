import { FRAMIE_MARKER, FramieEnvelope } from "./protocol";

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
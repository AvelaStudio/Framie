export type PeerHandler<T = unknown> = (payload: T) => void;

export interface PeerChannel {
  send: <T>(type: string, payload?: T) => void;
  on: <T>(type: string, handler: PeerHandler<T>) => () => void;
}

export function createPeerChannel(targetOrigin = "*"): PeerChannel {
  const listeners = new Map<string, Set<PeerHandler>>();

  const handleMessage = (event: MessageEvent) => {
    const data = event.data as { type?: string; payload?: unknown };
    if (!data || typeof data.type !== "string") return;

    const handlers = listeners.get(data.type);
    if (!handlers) return;

    handlers.forEach((handler) => handler(data.payload));
  };

  window.addEventListener("message", handleMessage);

  return {
    send(type, payload) {
      window.parent.postMessage({ type, payload }, targetOrigin);
    },
    on(type, handler) {
      if (!listeners.has(type)) {
        listeners.set(type, new Set());
      }
      listeners.get(type)?.add(handler as PeerHandler);

      return () => {
        listeners.get(type)?.delete(handler as PeerHandler);
      };
    },
  };
}

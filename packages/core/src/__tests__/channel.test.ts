import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FramieChannel } from "../channel/FramieChannel";
import { FRAMIE_MARKER, HandshakeError, HELLO_EVENT, PROTOCOL_VERSION, READY_EVENT } from "../channel/protocol";

// ─── helpers ─────────────────────────────────────────────────────────────────

function makeIframe(): HTMLIFrameElement {
  const iframe = document.createElement("iframe");
  document.body.appendChild(iframe);
  return iframe;
}

/**
 * Simulate a message arriving from a given source window & origin.
 * We dispatch on the *parent* window so the channel handler can intercept it.
 */
function dispatchFrom(
  source: Window | null,
  origin: string,
  data: unknown,
): void {
  const event = new MessageEvent("message", { data, origin, source });
  window.dispatchEvent(event);
}

function readyEnvelope() {
  return { [FRAMIE_MARKER]: true, type: READY_EVENT };
}

function envelope(type: string, payload?: unknown, extra?: Record<string, unknown>) {
  return { [FRAMIE_MARKER]: true, type, payload, ...extra };
}

// ─── suite ───────────────────────────────────────────────────────────────────

describe("FramieChannel", () => {
  let channel: FramieChannel;
  let iframe: HTMLIFrameElement;

  beforeEach(() => {
    channel = new FramieChannel("https://widget.example.com");
    iframe = makeIframe();
    channel.attach(iframe);
  });

  afterEach(() => {
    channel.destroy();
    iframe.remove();
    vi.restoreAllMocks();
  });

  // ─── origin / source checks ────────────────────────────────────────────────

  describe("security checks", () => {
    it("ignores messages from wrong origin", () => {
      const handler = vi.fn();
      channel.on("hello", handler);
      dispatchFrom(iframe.contentWindow, "https://evil.com", envelope("hello", "boom"));
      expect(handler).not.toHaveBeenCalled();
    });

    it("ignores messages from wrong source window", () => {
      const other = makeIframe();
      const handler = vi.fn();
      channel.on("hello", handler);
      dispatchFrom(other.contentWindow, "https://widget.example.com", envelope("hello", "boom"));
      expect(handler).not.toHaveBeenCalled();
      other.remove();
    });

    it("ignores non-Framie messages", () => {
      const handler = vi.fn();
      channel.on("hello", handler);
      dispatchFrom(iframe.contentWindow, "https://widget.example.com", { type: "hello", payload: 1 });
      expect(handler).not.toHaveBeenCalled();
    });
  });

  // ─── isReady / queue / flush ───────────────────────────────────────────────

  describe("message queue", () => {
    it("is not ready before READY_EVENT", () => {
      expect(channel.isReady).toBe(false);
    });

    it("becomes ready after READY_EVENT", () => {
      dispatchFrom(iframe.contentWindow, "https://widget.example.com", readyEnvelope());
      expect(channel.isReady).toBe(true);
    });

    it("buffers send() calls before READY_EVENT and flushes in order", () => {
      const postMessage = vi.fn();
      const fakeWindow = { postMessage };
      Object.defineProperty(iframe, "contentWindow", {
        get: () => fakeWindow,
        configurable: true,
      });

      channel.send("a", 1);
      channel.send("b", 2);
      expect(postMessage).not.toHaveBeenCalled();

      window.dispatchEvent(
        new MessageEvent("message", {
          data: readyEnvelope(),
          origin: "https://widget.example.com",
          source: fakeWindow as unknown as Window,
        }),
      );

      expect(channel.isReady).toBe(true);
      expect(postMessage).toHaveBeenCalledTimes(2);
      expect(postMessage.mock.calls[0][0]).toMatchObject({ type: "a", payload: 1 });
      expect(postMessage.mock.calls[1][0]).toMatchObject({ type: "b", payload: 2 });
    });

    it("sends immediately when already ready", () => {
      const postMessage = vi.fn();
      const fakeWindow = { postMessage };
      Object.defineProperty(iframe, "contentWindow", {
        get: () => fakeWindow,
        configurable: true,
      });
      window.dispatchEvent(
        new MessageEvent("message", {
          data: readyEnvelope(),
          origin: "https://widget.example.com",
          source: fakeWindow as unknown as Window,
        }),
      );

      channel.send("ping", { v: 1 });
      expect(postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ [FRAMIE_MARKER]: true, type: "ping", payload: { v: 1 } }),
        "https://widget.example.com",
      );
    });
  });

  // ─── on / off ──────────────────────────────────────────────────────────────

  describe("on / off", () => {
    it("delivers a regular event to subscriber", () => {
      const handler = vi.fn();
      channel.on("greet", handler);
      dispatchFrom(iframe.contentWindow, "https://widget.example.com", envelope("greet", { name: "world" }));
      expect(handler).toHaveBeenCalledWith({ name: "world" });
    });

    it("returns an unsubscribe function", () => {
      const handler = vi.fn();
      const off = channel.on("greet", handler);
      off();
      dispatchFrom(iframe.contentWindow, "https://widget.example.com", envelope("greet", {}));
      expect(handler).not.toHaveBeenCalled();
    });

    it("off() removes a specific handler without touching others", () => {
      const h1 = vi.fn();
      const h2 = vi.fn();
      channel.on("x", h1);
      channel.on("x", h2);
      channel.off("x", h1);
      dispatchFrom(iframe.contentWindow, "https://widget.example.com", envelope("x"));
      expect(h1).not.toHaveBeenCalled();
      expect(h2).toHaveBeenCalled();
    });
  });

  // ─── request / response ────────────────────────────────────────────────────

  describe("request / response", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    it("resolves when the peer sends a matching response", async () => {
      const postMessage = vi.fn();
      const fakeWindow = { postMessage };
      Object.defineProperty(iframe, "contentWindow", {
        get: () => fakeWindow,
        configurable: true,
      });
      window.dispatchEvent(
        new MessageEvent("message", {
          data: readyEnvelope(),
          origin: "https://widget.example.com",
          source: fakeWindow as unknown as Window,
        }),
      );

      const promise = channel.request<string>("greet", { name: "Alice" });

      // request() is synchronous — postMessage was already called
      const sent = postMessage.mock.calls[0][0] as Record<string, unknown>;
      // requestId now lives at envelope level, not inside payload
      const requestId = sent.requestId as string;

      window.dispatchEvent(
        new MessageEvent("message", {
          data: envelope("greet", "Hello, Alice!", { requestId, isResponse: true }),
          origin: "https://widget.example.com",
          source: fakeWindow as unknown as Window,
        }),
      );

      await expect(promise).resolves.toBe("Hello, Alice!");
    });

    it("rejects on timeout", async () => {
      const postMessage = vi.fn();
      const fakeWindow = { postMessage };
      Object.defineProperty(iframe, "contentWindow", {
        get: () => fakeWindow,
        configurable: true,
      });
      window.dispatchEvent(
        new MessageEvent("message", {
          data: readyEnvelope(),
          origin: "https://widget.example.com",
          source: fakeWindow as unknown as Window,
        }),
      );

      const promise = channel.request("slow", undefined, { timeoutMs: 1000 });
      vi.advanceTimersByTime(1001);
      await expect(promise).rejects.toThrow("timed out after 1000ms");
    });

    it("requestId is at envelope level, not inside payload", () => {
      const postMessage = vi.fn();
      const fakeWindow = { postMessage };
      Object.defineProperty(iframe, "contentWindow", {
        get: () => fakeWindow,
        configurable: true,
      });
      window.dispatchEvent(
        new MessageEvent("message", {
          data: readyEnvelope(),
          origin: "https://widget.example.com",
          source: fakeWindow as unknown as Window,
        }),
      );

      // suppress the unresolved promise so it doesn't leak into afterEach
      channel.request("getData", { filter: "active" }).catch(() => {});
      const sent = postMessage.mock.calls[0][0] as Record<string, unknown>;
      // requestId must be a top-level field
      expect(typeof sent.requestId).toBe("string");
      // payload must not be polluted with requestId
      expect(sent.payload).toEqual({ filter: "active" });
    });

    it("rejects immediately when AbortSignal is already aborted", async () => {
      const controller = new AbortController();
      controller.abort();
      await expect(channel.request("x", undefined, { signal: controller.signal })).rejects.toThrow();
    });

    it("rejects when AbortSignal fires after request is sent", async () => {
      const postMessage = vi.fn();
      const fakeWindow = { postMessage };
      Object.defineProperty(iframe, "contentWindow", {
        get: () => fakeWindow,
        configurable: true,
      });
      window.dispatchEvent(
        new MessageEvent("message", {
          data: readyEnvelope(),
          origin: "https://widget.example.com",
          source: fakeWindow as unknown as Window,
        }),
      );

      const controller = new AbortController();
      const promise = channel.request("x", undefined, { signal: controller.signal });
      controller.abort();
      await expect(promise).rejects.toThrow();
    });

    it("rejects when peer responds with an error field", async () => {
      const postMessage = vi.fn();
      const fakeWindow = { postMessage };
      Object.defineProperty(iframe, "contentWindow", {
        get: () => fakeWindow,
        configurable: true,
      });
      window.dispatchEvent(
        new MessageEvent("message", {
          data: readyEnvelope(),
          origin: "https://widget.example.com",
          source: fakeWindow as unknown as Window,
        }),
      );

      const promise = channel.request("fail");
      const sent = postMessage.mock.calls[0][0] as Record<string, unknown>;
      const requestId = sent.requestId as string;

      window.dispatchEvent(
        new MessageEvent("message", {
          data: envelope("fail", undefined, { requestId, isResponse: true, error: "something went wrong" }),
          origin: "https://widget.example.com",
          source: fakeWindow as unknown as Window,
        }),
      );

      await expect(promise).rejects.toThrow("something went wrong");
    });
  });

  // ─── onRequest ─────────────────────────────────────────────────────────────

  describe("onRequest", () => {
    it("responds to peer-initiated request", async () => {
      const postMessage = vi.fn();
      const fakeWindow = { postMessage };
      Object.defineProperty(iframe, "contentWindow", {
        get: () => fakeWindow,
        configurable: true,
      });

      channel.onRequest("compute", (payload: unknown) => {
        const { value } = payload as { value: number };
        return value * 2;
      });

      window.dispatchEvent(
        new MessageEvent("message", {
          data: envelope("compute", { value: 21 }, { requestId: "req-1" }),
          origin: "https://widget.example.com",
          source: fakeWindow as unknown as Window,
        }),
      );

      // handler runs in tick 1, respond() runs in tick 2
      await Promise.resolve();
      await Promise.resolve();
      expect(postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          [FRAMIE_MARKER]: true,
          type: "compute",
          payload: 42,
          requestId: "req-1",
          isResponse: true,
        }),
        "https://widget.example.com",
      );
    });

    it("returns an error response when no handler is registered", async () => {
      const postMessage = vi.fn();
      const fakeWindow = { postMessage };
      Object.defineProperty(iframe, "contentWindow", {
        get: () => fakeWindow,
        configurable: true,
      });

      window.dispatchEvent(
        new MessageEvent("message", {
          data: envelope("unknown", undefined, { requestId: "req-2" }),
          origin: "https://widget.example.com",
          source: fakeWindow as unknown as Window,
        }),
      );

      await Promise.resolve();
      await Promise.resolve();
      expect(postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ isResponse: true, error: expect.stringContaining("no handler") }),
        "https://widget.example.com",
      );
    });
  });

  // ─── detach / destroy ─────────────────────────────────────────────────────

  describe("detach / destroy", () => {
    it("detach() rejects pending requests", async () => {
      vi.useFakeTimers();
      const postMessage = vi.fn();
      const fakeWindow = { postMessage };
      Object.defineProperty(iframe, "contentWindow", {
        get: () => fakeWindow,
        configurable: true,
      });
      window.dispatchEvent(
        new MessageEvent("message", {
          data: readyEnvelope(),
          origin: "https://widget.example.com",
          source: fakeWindow as unknown as Window,
        }),
      );

      const promise = channel.request("x");
      channel.detach();
      await expect(promise).rejects.toThrow("channel detached");
      vi.useRealTimers();
    });

    it("destroy() stops processing further messages", () => {
      const handler = vi.fn();
      channel.on("msg", handler);
      channel.destroy();
      dispatchFrom(iframe.contentWindow, "https://widget.example.com", envelope("msg", "hello"));
      expect(handler).not.toHaveBeenCalled();
    });

    it("send() is a no-op after destroy()", () => {
      const postMessage = vi.fn();
      Object.defineProperty(iframe, "contentWindow", {
        get: () => ({ postMessage }),
        configurable: true,
      });
      dispatchFrom(iframe.contentWindow, "https://widget.example.com", readyEnvelope());
      channel.destroy();
      channel.send("ping");
      expect(postMessage).not.toHaveBeenCalled();
    });
  });

  // ─── handshake ──────────────────────────────────────────────────────────────

  describe("handshake", () => {
    it("sends __framie:hello on iframe load event", () => {
      const postMessage = vi.fn();
      const fakeWindow = { postMessage };
      Object.defineProperty(iframe, "contentWindow", {
        get: () => fakeWindow,
        configurable: true,
      });

      iframe.dispatchEvent(new Event("load"));

      expect(postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          [FRAMIE_MARKER]: true,
          type: HELLO_EVENT,
          payload: expect.objectContaining({
            sdkVersion: expect.any(String),
            protocolVersion: PROTOCOL_VERSION,
          }),
        }),
        "https://widget.example.com",
      );
    });

    it("does NOT send hello before load event fires", () => {
      const postMessage = vi.fn();
      Object.defineProperty(iframe, "contentWindow", {
        get: () => ({ postMessage }),
        configurable: true,
      });
      // No load event dispatched.
      expect(postMessage).not.toHaveBeenCalled();
    });

    it("FramieChannelOptions: accepts options object with sdkVersion and onError", () => {
      const ch = new FramieChannel({
        targetOrigin: "https://widget.example.com",
        sdkVersion: "1.2.3",
        onError: vi.fn(),
      });
      expect(ch).toBeInstanceOf(FramieChannel);
      ch.destroy();
    });

    it("flushes queue when READY_EVENT carries no version payload (backward compat)", () => {
      const postMessage = vi.fn();
      const fakeWindow = { postMessage };
      Object.defineProperty(iframe, "contentWindow", {
        get: () => fakeWindow,
        configurable: true,
      });
      channel.send("msg", 1);
      // READY_EVENT with no payload — old-style
      window.dispatchEvent(
        new MessageEvent("message", {
          data: readyEnvelope(),
          origin: "https://widget.example.com",
          source: fakeWindow as unknown as Window,
        }),
      );
      expect(channel.isReady).toBe(true);
      expect(postMessage).toHaveBeenCalledWith(expect.objectContaining({ type: "msg" }), "https://widget.example.com");
    });

    it("flushes queue when READY_EVENT carries a matching protocolVersion", () => {
      const postMessage = vi.fn();
      const fakeWindow = { postMessage };
      Object.defineProperty(iframe, "contentWindow", {
        get: () => fakeWindow,
        configurable: true,
      });
      channel.send("msg", 2);
      window.dispatchEvent(
        new MessageEvent("message", {
          data: { ...readyEnvelope(), payload: { sdkVersion: "0.1.0", protocolVersion: PROTOCOL_VERSION } },
          origin: "https://widget.example.com",
          source: fakeWindow as unknown as Window,
        }),
      );
      expect(channel.isReady).toBe(true);
      expect(postMessage).toHaveBeenCalledWith(expect.objectContaining({ type: "msg" }), "https://widget.example.com");
    });

    it("fires onError and does NOT flush queue on protocol version mismatch", () => {
      const onError = vi.fn();
      const fr = makeIframe();
      const mismatchChannel = new FramieChannel({
        targetOrigin: "https://widget.example.com",
        onError,
      });
      mismatchChannel.attach(fr);

      const postMessage = vi.fn();
      const fakeWindow = { postMessage };
      Object.defineProperty(fr, "contentWindow", {
        get: () => fakeWindow,
        configurable: true,
      });

      mismatchChannel.send("important", "payload");

      window.dispatchEvent(
        new MessageEvent("message", {
          data: { [FRAMIE_MARKER]: true, type: READY_EVENT, payload: { sdkVersion: "99.0.0", protocolVersion: 99 } },
          origin: "https://widget.example.com",
          source: fakeWindow as unknown as Window,
        }),
      );

      expect(onError).toHaveBeenCalledWith(expect.any(HandshakeError));
      // Queue was NOT flushed — channel stays blocked.
      expect(postMessage).not.toHaveBeenCalled();
      expect(mismatchChannel.isReady).toBe(false);

      mismatchChannel.destroy();
      fr.remove();
    });
  });
});

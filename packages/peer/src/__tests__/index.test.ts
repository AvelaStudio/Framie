import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PeerChannel } from "..";
import { HELLO_EVENT, PROTOCOL_VERSION } from "../channel/protocol";

const MARKER = "__framie";
const HOST = "https://host.example.com";

function envelope(type: string, payload?: unknown, extra?: Record<string, unknown>) {
  return { [MARKER]: true, type, payload, ...extra };
}

function dispatchFromHost(origin: string, data: unknown) {
  window.dispatchEvent(new MessageEvent("message", { data, origin }));
}

// ─── PeerChannel class ────────────────────────────────────────────────────────

describe("PeerChannel", () => {
  let channel: PeerChannel;
  let postMessage: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    postMessage = vi.fn();
    vi.spyOn(window, "parent", "get").mockReturnValue({ postMessage } as unknown as Window);
    channel = new PeerChannel({ allowedOrigin: HOST });
  });

  afterEach(() => {
    channel.destroy();
    vi.restoreAllMocks();
  });

  // ─── message listener ──────────────────────────────────────────────────────

  it("attaches a message listener on window", () => {
    const spy = vi.spyOn(window, "addEventListener");
    const ch = new PeerChannel({ allowedOrigin: HOST });
    expect(spy).toHaveBeenCalledWith("message", expect.any(Function));
    ch.destroy();
  });

  // ─── origin filtering ──────────────────────────────────────────────────────

  it("ignores messages from wrong origin", () => {
    const handler = vi.fn();
    channel.on("hello", handler);
    dispatchFromHost("https://evil.com", envelope("hello", "boom"));
    expect(handler).not.toHaveBeenCalled();
  });

  it("accepts messages when allowedOrigin is *", () => {
    const ch = new PeerChannel({ allowedOrigin: "*" });
    const handler = vi.fn();
    ch.on("ping", handler);
    dispatchFromHost("https://any.example.com", envelope("ping", 1));
    expect(handler).toHaveBeenCalledWith(1);
    ch.destroy();
  });

  it("ignores non-Framie messages", () => {
    const handler = vi.fn();
    channel.on("ping", handler);
    dispatchFromHost(HOST, { type: "ping", payload: 42 }); // no __framie marker
    expect(handler).not.toHaveBeenCalled();
  });

  // ─── ready() ───────────────────────────────────────────────────────────────

  it("ready() posts READY_EVENT to parent", () => {
    channel.ready();
    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ [MARKER]: true, type: "__framie:ready" }),
      HOST,
    );
  });

  // ─── send() ────────────────────────────────────────────────────────────────

  it("send() posts a Framie envelope to parent", () => {
    channel.send("greet", { name: "world" });
    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ [MARKER]: true, type: "greet", payload: { name: "world" } }),
      HOST,
    );
  });

  it("send() targets the supplied allowedOrigin", () => {
    channel.send("x");
    const [, targetOrigin] = postMessage.mock.calls[0];
    expect(targetOrigin).toBe(HOST);
  });

  // ─── on / off ──────────────────────────────────────────────────────────────

  it("on() delivers incoming messages to handler", () => {
    const handler = vi.fn();
    channel.on("greet", handler);
    dispatchFromHost(HOST, envelope("greet", { name: "Alice" }));
    expect(handler).toHaveBeenCalledWith({ name: "Alice" });
  });

  it("on() returns an unsubscribe function", () => {
    const handler = vi.fn();
    const off = channel.on("ping", handler);
    expect(typeof off).toBe("function");
    off();
    dispatchFromHost(HOST, envelope("ping", 42));
    expect(handler).not.toHaveBeenCalled();
  });

  it("off() removes a specific handler", () => {
    const h1 = vi.fn();
    const h2 = vi.fn();
    channel.on("x", h1);
    channel.on("x", h2);
    channel.off("x", h1);
    dispatchFromHost(HOST, envelope("x"));
    expect(h1).not.toHaveBeenCalled();
    expect(h2).toHaveBeenCalled();
  });

  // ─── request() ─────────────────────────────────────────────────────────────

  describe("request()", () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it("resolves when host replies with matching requestId", async () => {
      const promise = channel.request<number>("compute", { x: 6 });

      const sent = postMessage.mock.calls[0][0] as Record<string, unknown>;
      // requestId lives at envelope level
      const requestId = sent.requestId as string;

      dispatchFromHost(HOST, envelope("compute", 42, { requestId, isResponse: true }));

      await expect(promise).resolves.toBe(42);
    });

    it("rejects on timeout", async () => {
      const promise = channel.request("slow", undefined, { timeoutMs: 500 });
      vi.advanceTimersByTime(501);
      await expect(promise).rejects.toThrow("timed out after 500ms");
    });

    it("rejects when host responds with error", async () => {
      const promise = channel.request("fail");
      const sent = postMessage.mock.calls[0][0] as Record<string, unknown>;
      const requestId = sent.requestId as string;

      dispatchFromHost(HOST, envelope("fail", undefined, { requestId, isResponse: true, error: "boom" }));

      await expect(promise).rejects.toThrow("boom");
    });

    it("requestId is at envelope level, not inside payload", () => {
      // suppress the unresolved promise so it doesn't leak into afterEach
      channel.request("getData", { filter: "active" }).catch(() => {});
      const sent = postMessage.mock.calls[0][0] as Record<string, unknown>;
      expect(typeof sent.requestId).toBe("string");
      expect(sent.payload).toEqual({ filter: "active" });
    });

    it("rejects immediately when AbortSignal is already aborted", async () => {
      const controller = new AbortController();
      controller.abort();
      await expect(channel.request("x", undefined, { signal: controller.signal })).rejects.toThrow();
    });

    it("rejects when AbortSignal fires mid-flight", async () => {
      const controller = new AbortController();
      const promise = channel.request("x", undefined, { signal: controller.signal });
      controller.abort();
      await expect(promise).rejects.toThrow();
    });
  });

  // ─── onRequest() ───────────────────────────────────────────────────────────

  describe("onRequest()", () => {
    it("handles host-initiated request and sends response", async () => {
      channel.onRequest("double", (payload: unknown) => {
        return (payload as { value: number }).value * 2;
      });

      dispatchFromHost(HOST, envelope("double", { value: 7 }, { requestId: "r-1" }));

      // handler runs in tick 1, respond() runs in tick 2
      await Promise.resolve();
      await Promise.resolve();

      expect(postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          [MARKER]: true,
          type: "double",
          payload: 14,
          requestId: "r-1",
          isResponse: true,
        }),
        HOST,
      );
    });

    it("responds with error when no handler registered", async () => {
      dispatchFromHost(HOST, envelope("unknown", undefined, { requestId: "r-2" }));

      await Promise.resolve();
      await Promise.resolve();

      expect(postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ isResponse: true, error: expect.stringContaining("no handler") }),
        HOST,
      );
    });

    it("onRequest() returns an unsubscribe function", () => {
      const handler = vi.fn();
      const off = channel.onRequest("x", handler);
      expect(typeof off).toBe("function");
    });
  });

  // ─── destroy() ─────────────────────────────────────────────────────────────

  describe("destroy()", () => {
    it("rejects pending requests on destroy", async () => {
      vi.useFakeTimers();
      const promise = channel.request("x");
      channel.destroy();
      await expect(promise).rejects.toThrow("destroyed");
      vi.useRealTimers();
    });

    it("no-ops send() after destroy", () => {
      channel.destroy();
      channel.send("ping");
      expect(postMessage).not.toHaveBeenCalled();
    });

    it("stops delivering messages after destroy", () => {
      const handler = vi.fn();
      channel.on("msg", handler);
      channel.destroy();
      dispatchFromHost(HOST, envelope("msg", "hello"));
      expect(handler).not.toHaveBeenCalled();
    });
  });

  // ─── handshake ─────────────────────────────────────────────────────────────

  describe("handshake", () => {
    it("ready() includes version payload", () => {
      channel.ready();
      expect(postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          [MARKER]: true,
          type: "__framie:ready",
          payload: expect.objectContaining({
            sdkVersion: expect.any(String),
            protocolVersion: PROTOCOL_VERSION,
          }),
        }),
        HOST,
      );
    });

    it("handles __framie:hello with compatible version without error", () => {
      const onError = vi.fn();
      const ch = new PeerChannel({ allowedOrigin: HOST, onError });
      dispatchFromHost(HOST, {
        [MARKER]: true,
        type: HELLO_EVENT,
        payload: { sdkVersion: "0.1.0", protocolVersion: PROTOCOL_VERSION },
      });
      expect(onError).not.toHaveBeenCalled();
      ch.destroy();
    });

    it("fires onError when host sends incompatible protocolVersion", () => {
      const onError = vi.fn();
      const ch = new PeerChannel({ allowedOrigin: HOST, onError });
      dispatchFromHost(HOST, {
        [MARKER]: true,
        type: HELLO_EVENT,
        payload: { sdkVersion: "99.0.0", protocolVersion: 99 },
      });
      expect(onError).toHaveBeenCalledWith(expect.any(Error));
      ch.destroy();
    });

    it("ignores __framie:hello with no version info (backward compat)", () => {
      const onError = vi.fn();
      const ch = new PeerChannel({ allowedOrigin: HOST, onError });
      dispatchFromHost(HOST, { [MARKER]: true, type: HELLO_EVENT });
      expect(onError).not.toHaveBeenCalled();
      ch.destroy();
    });
  });
});
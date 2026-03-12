import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPeerChannel } from "../index";

describe("createPeerChannel", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("attaches a message listener on window", () => {
    const spy = vi.spyOn(window, "addEventListener");
    createPeerChannel();
    expect(spy).toHaveBeenCalledWith("message", expect.any(Function));
  });

  it("on() returns an unsubscribe function", () => {
    const channel = createPeerChannel();
    const off = channel.on("ping", vi.fn());
    expect(typeof off).toBe("function");
  });

  it("delivers incoming messages to registered handlers", () => {
    const channel = createPeerChannel();
    const handler = vi.fn();
    channel.on("greet", handler);

    window.dispatchEvent(
      new MessageEvent("message", {
        data: { type: "greet", payload: { name: "world" } },
      }),
    );

    expect(handler).toHaveBeenCalledWith({ name: "world" });
  });

  it("does not deliver after unsubscribe", () => {
    const channel = createPeerChannel();
    const handler = vi.fn();
    const off = channel.on("ping", handler);
    off();

    window.dispatchEvent(new MessageEvent("message", { data: { type: "ping", payload: 42 } }));

    expect(handler).not.toHaveBeenCalled();
  });

  it("ignores messages with no type field", () => {
    const channel = createPeerChannel();
    const handler = vi.fn();
    channel.on("ping", handler);

    window.dispatchEvent(new MessageEvent("message", { data: { payload: 42 } }));

    expect(handler).not.toHaveBeenCalled();
  });

  it("send posts to window.parent with correct structure", () => {
    const postMessage = vi.fn();
    vi.spyOn(window, "parent", "get").mockReturnValue({ postMessage } as unknown as Window);

    const channel = createPeerChannel("https://host.example.com");
    channel.send("ready", { version: 1 });

    expect(postMessage).toHaveBeenCalledWith(
      { type: "ready", payload: { version: 1 } },
      "https://host.example.com",
    );
  });
});

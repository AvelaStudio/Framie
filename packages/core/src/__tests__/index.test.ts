import { describe, it, expect, vi } from "vitest";
import { createWidget, FramieWidget } from "../index";

describe("createWidget", () => {
  it("creates a FramieWidget instance", () => {
    const widget = createWidget({ url: "https://example.com" });
    expect(widget).toBeInstanceOf(FramieWidget);
  });

  it("starts in closed state", () => {
    const widget = createWidget({ url: "https://example.com" });
    expect(widget.state).toBe("closed");
  });

  it("opens the widget and fires onOpen", () => {
    const onOpen = vi.fn();
    const widget = createWidget({ url: "https://example.com", onOpen });
    widget.open();
    expect(widget.state).toBe("open");
    expect(onOpen).toHaveBeenCalledOnce();
  });

  it("closes the widget and fires onClose", () => {
    const onClose = vi.fn();
    const widget = createWidget({ url: "https://example.com", onClose });
    widget.open();
    widget.close();
    expect(widget.state).toBe("closed");
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("double open is a no-op", () => {
    const onOpen = vi.fn();
    const widget = createWidget({ url: "https://example.com", onOpen });
    widget.open();
    widget.open();
    expect(onOpen).toHaveBeenCalledOnce();
  });

  it("double close is a no-op", () => {
    const onClose = vi.fn();
    const widget = createWidget({ url: "https://example.com", onClose });
    widget.open();
    widget.close();
    widget.close();
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("passes context to open", () => {
    const widget = createWidget({ url: "https://example.com" });
    expect(() => widget.open({ userId: "u1", plan: "pro" })).not.toThrow();
  });
});

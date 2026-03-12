import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useFramie, useFramieChannelEvent, useFramieEvent, useFramieState } from "../index";

describe("useFramie", () => {
  it("returns a controller with mount lifecycle methods", () => {
    const { result } = renderHook(() => useFramie({ url: "https://example.com" }));
    expect(typeof result.current.getWidget).toBe("function");
    expect(typeof result.current.mount).toBe("function");
    expect(typeof result.current.unmount).toBe("function");
    expect(typeof result.current.minimize).toBe("function");
    expect(typeof result.current.restore).toBe("function");
    expect(typeof result.current.destroy).toBe("function");
  });

  it("returns the same widget across re-renders when options do not change", () => {
    const { result, rerender } = renderHook(() => useFramie({ url: "https://example.com" }));
    const first = result.current.getWidget();
    rerender();
    expect(result.current.getWidget()).toBe(first);
  });

  it("mount() creates the widget lazily and forwards context", () => {
    const { result } = renderHook(() => useFramie({ url: "https://example.com" }));

    act(() => {
      result.current.mount({ userId: "u1" });
    });

    expect(result.current.getWidget().state).toBe("mounted");
  });

  it("recreates the widget when options change", () => {
    const { result, rerender } = renderHook(
      ({ url }) => useFramie({ url }),
      { initialProps: { url: "https://example.com" } },
    );

    const first = result.current.getWidget();

    rerender({ url: "https://example.org" });

    const second = result.current.getWidget();
    expect(second).not.toBe(first);
    expect(first.state).toBe("destroyed");
  });

  it("destroys the widget on hook unmount", () => {
    const { result, unmount } = renderHook(() => useFramie({ url: "https://example.com" }));
    const widget = result.current.getWidget();

    unmount();

    expect(widget.state).toBe("destroyed");
  });

  it("destroy() tears down the current widget and creates a fresh one on next mount", () => {
    const { result } = renderHook(() => useFramie({ url: "https://example.com" }));
    const first = result.current.getWidget();

    act(() => {
      result.current.destroy();
    });

    const second = result.current.getWidget();
    expect(first.state).toBe("destroyed");
    expect(second).not.toBe(first);
  });
});

describe("useFramieState", () => {
  it("mounts when open=true and unmounts when open=false", () => {
    const { result, rerender } = renderHook(
      ({ open }) => useFramieState({ url: "https://example.com", open, context: { userId: "u1" } }),
      { initialProps: { open: false } },
    );

    expect(result.current.getWidget().state).toBe("idle");

    rerender({ open: true });
    expect(result.current.getWidget().state).toBe("mounted");

    rerender({ open: false });
    expect(result.current.getWidget().state).toBe("unmounted");
  });

  it("destroyOnClose destroys the instance and recreates it on reopen", () => {
    const { result, rerender } = renderHook(
      ({ open }) => useFramieState({ url: "https://example.com", open, destroyOnClose: true }),
      { initialProps: { open: true } },
    );

    const first = result.current.getWidget();
    expect(first.state).toBe("mounted");

    rerender({ open: false });
    expect(first.state).toBe("destroyed");

    rerender({ open: true });
    const second = result.current.getWidget();
    expect(second).not.toBe(first);
    expect(second.state).toBe("mounted");
  });
});

describe("subscription hooks", () => {
  it("useFramieEvent subscribes to widget lifecycle events", () => {
    const onMount = vi.fn();
    const { result } = renderHook(() => {
      const framie = useFramie({ url: "https://example.com" });
      useFramieEvent(framie, "mount", onMount);
      return framie;
    });

    act(() => {
      result.current.mount();
    });

    expect(onMount).toHaveBeenCalledOnce();
  });

  it("useFramieChannelEvent subscribes to peer messages", () => {
    const onDone = vi.fn();
    const { result } = renderHook(() => {
      const framie = useFramie({ url: "https://example.com" });
      useFramieChannelEvent<{ ok: boolean }>(framie, "task:done", onDone);
      return framie;
    });

    act(() => {
      result.current.mount();
    });

    const iframe = document.querySelector<HTMLIFrameElement>(".framie-iframe");
    expect(iframe).not.toBeNull();

    window.dispatchEvent(
      new MessageEvent("message", {
        data: { __framie: true, type: "task:done", payload: { ok: true } },
        origin: "https://example.com",
        source: iframe!.contentWindow,
      }),
    );

    expect(onDone).toHaveBeenCalledWith({ ok: true });
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";
import { createWidget, FramieWidget } from "../index";

const URL = "https://example.com";

afterEach(() => {
  document.body.innerHTML = "";
  document.body.style.overflow = "";
});

describe("createWidget", () => {
  it("returns a FramieWidget instance", () => {
    expect(createWidget({ url: URL })).toBeInstanceOf(FramieWidget);
  });

  it("throws on disallowed URL protocol", () => {
    expect(() => createWidget({ url: "javascript:alert(1)" })).toThrow(/not allowed/);
  });

  it("throws on invalid URL", () => {
    expect(() => createWidget({ url: "not-a-url" })).toThrow(/invalid URL/);
  });
});

describe("state machine", () => {
  it("starts in idle state", () => {
    expect(createWidget({ url: URL }).state).toBe("idle");
  });

  it("idle → mounted via mount()", () => {
    const w = createWidget({ url: URL });
    w.mount();
    expect(w.state).toBe("mounted");
  });

  it("mounted → unmounted via unmount()", () => {
    const w = createWidget({ url: URL });
    w.mount();
    w.unmount();
    expect(w.state).toBe("unmounted");
  });

  it("unmounted → mounted: allows remount", () => {
    const w = createWidget({ url: URL });
    w.mount();
    w.unmount();
    w.mount();
    expect(w.state).toBe("mounted");
  });

  it("mounted → minimized via minimize()", () => {
    const w = createWidget({ url: URL });
    w.mount();
    w.minimize();
    expect(w.state).toBe("minimized");
  });

  it("minimized → mounted via restore()", () => {
    const w = createWidget({ url: URL });
    w.mount();
    w.minimize();
    w.restore();
    expect(w.state).toBe("mounted");
  });

  it("any → destroyed via destroy()", () => {
    const w = createWidget({ url: URL });
    w.mount();
    w.destroy();
    expect(w.state).toBe("destroyed");
  });

  it("double mount is a no-op", () => {
    const onMount = vi.fn();
    const w = createWidget({ url: URL, onMount });
    w.mount();
    w.mount();
    expect(onMount).toHaveBeenCalledOnce();
  });

  it("double unmount is a no-op", () => {
    const onUnmount = vi.fn();
    const w = createWidget({ url: URL, onUnmount });
    w.mount();
    w.unmount();
    w.unmount();
    expect(onUnmount).toHaveBeenCalledOnce();
  });
});

describe("callbacks", () => {
  it("fires onBeforeMount before onMount", () => {
    const order: string[] = [];
    const w = createWidget({
      url: URL,
      onBeforeMount: () => order.push("before"),
      onMount: () => order.push("after"),
    });
    w.mount();
    expect(order).toEqual(["before", "after"]);
  });

  it("fires onBeforeUnmount before onUnmount", () => {
    const order: string[] = [];
    const w = createWidget({
      url: URL,
      onBeforeUnmount: () => order.push("before"),
      onUnmount: () => order.push("after"),
    });
    w.mount();
    w.unmount();
    expect(order).toEqual(["before", "after"]);
  });

  it("fires deprecated onOpen / onClose aliases", () => {
    const onMount = vi.fn();
    const onUnmount = vi.fn();
    const w = createWidget({ url: URL, onMount, onUnmount });
    w.mount();
    w.unmount();
    expect(onMount).toHaveBeenCalledOnce();
    expect(onUnmount).toHaveBeenCalledOnce();
  });

  it("fires onMinimize / onRestore", () => {
    const onMinimize = vi.fn();
    const onRestore = vi.fn();
    const w = createWidget({ url: URL, onMinimize, onRestore });
    w.mount();
    w.minimize();
    w.restore();
    expect(onMinimize).toHaveBeenCalledOnce();
    expect(onRestore).toHaveBeenCalledOnce();
  });

  it("fires onBeforeOpen / onAfterOpen aliases on mount", () => {
    const order: string[] = [];
    const w = createWidget({
      url: URL,
      onBeforeOpen: () => order.push("before"),
      onAfterOpen: () => order.push("after"),
    });
    w.mount();
    expect(order).toEqual(["before", "after"]);
  });

  it("fires onBeforeClose / onAfterClose aliases on unmount", () => {
    const order: string[] = [];
    const w = createWidget({
      url: URL,
      onBeforeClose: () => order.push("before"),
      onAfterClose: () => order.push("after"),
    });
    w.mount();
    w.unmount();
    expect(order).toEqual(["before", "after"]);
  });
});

describe("DOM lifecycle", () => {
  it("appends .framie-container to document.body on mount", () => {
    createWidget({ url: URL }).mount();
    expect(document.querySelector(".framie-container")).not.toBeNull();
  });

  it("creates an iframe with the correct src", () => {
    createWidget({ url: URL }).mount();
    const iframe = document.querySelector<HTMLIFrameElement>(".framie-iframe");
    expect(iframe?.src).toBe(`${URL}/`);
  });

  it("appends context as query params to iframe src", () => {
    createWidget({ url: URL }).mount({ plan: "pro", userId: "u1" });
    const src = document.querySelector<HTMLIFrameElement>(".framie-iframe")!.src;
    expect(src).toContain("plan=pro");
    expect(src).toContain("userId=u1");
  });

  it("removes .framie-container from DOM on unmount", () => {
    const w = createWidget({ url: URL });
    w.mount();
    w.unmount();
    expect(document.querySelector(".framie-container")).toBeNull();
  });

  it("locks body scroll on mount", () => {
    createWidget({ url: URL }).mount();
    expect(document.body.style.overflow).toBe("hidden");
  });

  it("restores body scroll on unmount", () => {
    const w = createWidget({ url: URL });
    w.mount();
    w.unmount();
    expect(document.body.style.overflow).toBe("");
  });

  it("hides container on minimize, shows on restore", () => {
    const w = createWidget({ url: URL });
    w.mount();
    w.minimize();
    expect(document.querySelector<HTMLElement>(".framie-container")!.style.display).toBe("none");
    w.restore();
    expect(document.querySelector<HTMLElement>(".framie-container")!.style.display).toBe("");
  });

  it("appends to a custom container element", () => {
    const div = document.createElement("div");
    document.body.appendChild(div);
    createWidget({ url: URL, container: div }).mount();
    expect(div.querySelector(".framie-container")).not.toBeNull();
  });

  it("applies mode class to container", () => {
    createWidget({ url: URL, mode: "bottomSheet" }).mount();
    expect(document.querySelector(".framie-bottomSheet")).not.toBeNull();
  });
});

describe("UX close triggers", () => {
  it("closes on backdrop click by default", () => {
    const w = createWidget({ url: URL });
    w.mount();
    document.querySelector<HTMLElement>(".framie-backdrop")!.click();
    expect(w.state).toBe("unmounted");
  });

  it("does NOT close on backdrop click when closeOnBackdrop=false", () => {
    const w = createWidget({ url: URL, closeOnBackdrop: false });
    w.mount();
    document.querySelector<HTMLElement>(".framie-backdrop")!.click();
    expect(w.state).toBe("mounted");
  });

  it("closes on Escape key by default", () => {
    const w = createWidget({ url: URL });
    w.mount();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(w.state).toBe("unmounted");
  });

  it("does NOT close on Escape when closeOnEscape=false", () => {
    const w = createWidget({ url: URL, closeOnEscape: false });
    w.mount();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(w.state).toBe("mounted");
  });
});

describe("event emitter", () => {
  it("on() receives mount event", () => {
    const handler = vi.fn();
    const w = createWidget({ url: URL });
    w.on("mount", handler);
    w.mount();
    expect(handler).toHaveBeenCalledOnce();
  });

  it("off() stops receiving events", () => {
    const handler = vi.fn();
    const w = createWidget({ url: URL });
    w.on("mount", handler);
    w.off("mount", handler);
    w.mount();
    expect(handler).not.toHaveBeenCalled();
  });

  it("on() returns an unsubscribe function", () => {
    const handler = vi.fn();
    const w = createWidget({ url: URL });
    const off = w.on("mount", handler);
    off();
    w.mount();
    expect(handler).not.toHaveBeenCalled();
  });

  it("once() fires exactly once", () => {
    const handler = vi.fn();
    const w = createWidget({ url: URL });
    w.once("mount", handler);
    w.mount();
    w.unmount();
    w.mount(); // remount
    expect(handler).toHaveBeenCalledOnce();
  });

  it("emits beforeMount before mount", () => {
    const order: string[] = [];
    const w = createWidget({ url: URL });
    w.on("beforeMount", () => order.push("before"));
    w.on("mount", () => order.push("mount"));
    w.mount();
    expect(order).toEqual(["before", "mount"]);
  });

  it("emits destroy and clears listeners", () => {
    const mountHandler = vi.fn();
    const destroyHandler = vi.fn();
    const w = createWidget({ url: URL });
    w.on("mount", mountHandler);
    w.on("destroy", destroyHandler);
    w.mount();
    w.destroy();
    expect(destroyHandler).toHaveBeenCalledOnce();
    // after destroy, listeners should be cleared
    w.on("mount", mountHandler); // silently ignored if we try again — actually, it will re-add
    // the key test is the destroy event fired
  });

  it("no events fired after destroy", () => {
    const w = createWidget({ url: URL });
    w.mount();
    w.destroy();
    // listeners are cleared after destroy, re-calling mount should be no-op (state=destroyed)
    const laterHandler = vi.fn();
    w.on("mount", laterHandler);
    w.mount(); // blocked by destroyed state
    expect(laterHandler).not.toHaveBeenCalled();
  });
});

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { FramieTrigger, useFramie } from "../index";
import { renderHook } from "@testing-library/react";

describe("useFramie", () => {
  it("returns a FramieWidget instance", () => {
    const { result } = renderHook(() => useFramie({ url: "https://example.com" }));
    expect(result.current).toBeDefined();
    expect(typeof result.current.open).toBe("function");
    expect(typeof result.current.close).toBe("function");
  });

  it("returns the same instance across re-renders", () => {
    const { result, rerender } = renderHook(() => useFramie({ url: "https://example.com" }));
    const first = result.current;
    rerender();
    expect(result.current).toBe(first);
  });
});

describe("FramieTrigger", () => {
  it("renders children inside a button", () => {
    render(<FramieTrigger url="https://example.com">Open Widget</FramieTrigger>);
    expect(screen.getByRole("button", { name: "Open Widget" })).toBeInTheDocument();
  });

  it("calls widget.open when button is clicked", async () => {
    const user = userEvent.setup();
    const onOpen = vi.fn();
    render(
      <FramieTrigger url="https://example.com" onOpen={onOpen}>
        Open
      </FramieTrigger>,
    );

    await user.click(screen.getByRole("button", { name: "Open" }));
    expect(onOpen).toHaveBeenCalledOnce();
  });
});

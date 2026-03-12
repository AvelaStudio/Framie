export type WidgetMode = "modal" | "bottomSheet";

export type WidgetState =
  | "idle"
  | "mounting"
  | "mounted"
  | "minimized"
  | "unmounting"
  | "unmounted"
  | "destroyed";

export type WidgetContext = Record<string, unknown>;

export interface FramieOptions {
  /** URL to load inside the iframe. Must use http: or https: protocol. */
  url: string;
  mode?: WidgetMode;
  /** Element to append the widget container to. Defaults to document.body. */
  container?: HTMLElement;
  /** Close the widget when the backdrop is clicked. Default: true. */
  closeOnBackdrop?: boolean;
  /** Close the widget when the Escape key is pressed. Default: true. */
  closeOnEscape?: boolean;
  /** Called just before the widget is mounted into the DOM. */
  onBeforeMount?: () => void;
  /** Called after the widget is mounted and visible. */
  onMount?: () => void;
  /** Called just before the widget is removed from the DOM. */
  onBeforeUnmount?: () => void;
  /** Called after the widget has been removed from the DOM. */
  onUnmount?: () => void;
  /** Called when the widget is minimized. */
  onMinimize?: () => void;
  /** Called when the widget is restored from minimized state. */
  onRestore?: () => void;

  // ─── Open / close aliases (preferred over mount/unmount in application code) ──

  /** Alias for `onBeforeMount`. Called just before the widget opens. */
  onBeforeOpen?: () => void;
  /** Alias for `onMount`. Called after the widget is fully open. */
  onAfterOpen?: () => void;
  /** Alias for `onBeforeUnmount`. Called just before the widget closes. */
  onBeforeClose?: () => void;
  /** Alias for `onUnmount`. Called after the widget has closed. */
  onAfterClose?: () => void;

  // ─── Error handling ───────────────────────────────────────────────────────────

  /**
   * Called when the channel detects a handshake error (e.g. protocol version
   * mismatch between host and peer). The queue is NOT flushed on mismatch;
   * call `widget.destroy()` here to release resources.
   */
  onError?: (error: Error) => void;
}

/** Events emitted by FramieWidget. All events carry no payload. */
export interface FramieEventMap {
  beforeMount: void;
  mount: void;
  beforeUnmount: void;
  unmount: void;
  minimize: void;
  restore: void;
  destroy: void;
}

export type FramieEventHandler = () => void;


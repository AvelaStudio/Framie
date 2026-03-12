import { FramieChannel } from "../channel";
import { FramieEventHandler, FramieEventMap, FramieOptions, WidgetContext, WidgetState } from "./types";

const ALLOWED_PROTOCOLS = ["http:", "https:"];
const MOUNTABLE_STATES: WidgetState[] = ["idle", "unmounted"];
const UNMOUNTABLE_STATES: WidgetState[] = ["mounted", "minimized"];

export class FramieWidget {
  private _state: WidgetState = "idle";
  private readonly options: FramieOptions;

  /** Typed message channel to the iframe. Available immediately after construction. */
  public readonly channel: FramieChannel;

  private container: HTMLElement | null = null;
  private backdrop: HTMLElement | null = null;
  private iframe: HTMLIFrameElement | null = null;

  private readonly _listeners = new Map<string, Set<FramieEventHandler>>();

  private readonly _onBackdropClick: () => void;
  private readonly _onKeyDown: (e: KeyboardEvent) => void;

  constructor(options: FramieOptions) {
    this._validateUrl(options.url);
    this.options = options;
    this.channel = new FramieChannel({
      targetOrigin: new URL(options.url).origin,
      onError: options.onError,
    });

    this._onBackdropClick = () => {
      if (this.options.closeOnBackdrop !== false) this.unmount();
    };

    this._onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && this.options.closeOnEscape !== false) this.unmount();
    };
  }

  get state(): WidgetState {
    return this._state;
  }

  mount(context?: WidgetContext): void {
    if (!MOUNTABLE_STATES.includes(this._state)) return;

    this._state = "mounting";
    this.options.onBeforeMount?.();
    this.options.onBeforeOpen?.();
    this._emit("beforeMount");

    this._buildDOM(context);

    this._state = "mounted";
    this._emit("mount");
    this.options.onMount?.();
    this.options.onAfterOpen?.();
  }

  unmount(): void {
    if (!UNMOUNTABLE_STATES.includes(this._state)) return;

    this._state = "unmounting";
    this.options.onBeforeUnmount?.();
    this.options.onBeforeClose?.();
    this._emit("beforeUnmount");

    this._teardownDOM();

    this._state = "unmounted";
    this._emit("unmount");
    this.options.onUnmount?.();
    this.options.onAfterClose?.();
  }

  minimize(): void {
    if (this._state !== "mounted" || !this.container) return;

    this.container.style.display = "none";
    this._state = "minimized";
    this._emit("minimize");
    this.options.onMinimize?.();
  }

  restore(): void {
    if (this._state !== "minimized" || !this.container) return;

    this.container.style.display = "";
    this._state = "mounted";
    this._emit("restore");
    this.options.onRestore?.();
  }

  destroy(): void {
    if (this._state === "destroyed") return;

    if (UNMOUNTABLE_STATES.includes(this._state)) this._teardownDOM();

    this.channel.destroy();
    this._state = "destroyed";
    this._emit("destroy");
    this._listeners.clear();
  }

  on(event: keyof FramieEventMap, handler: FramieEventHandler): () => void {
    if (!this._listeners.has(event)) this._listeners.set(event, new Set());
    this._listeners.get(event)!.add(handler);
    return () => this.off(event, handler);
  }

  off(event: keyof FramieEventMap, handler: FramieEventHandler): void {
    this._listeners.get(event)?.delete(handler);
  }

  once(event: keyof FramieEventMap, handler: FramieEventHandler): () => void {
    const wrapper: FramieEventHandler = () => {
      handler();
      this.off(event, wrapper);
    };
    return this.on(event, wrapper);
  }

  private _emit(event: keyof FramieEventMap): void {
    this._listeners.get(event)?.forEach((h) => h());
  }

  private _buildDOM(context?: WidgetContext): void {
    const { url, mode = "modal", container: root = document.body } = this.options;

    this.container = document.createElement("div");
    this.container.className = `framie-container framie-${mode}`;
    this.container.setAttribute("role", "dialog");
    this.container.setAttribute("aria-modal", "true");

    this.backdrop = document.createElement("div");
    this.backdrop.className = "framie-backdrop";
    this.backdrop.addEventListener("click", this._onBackdropClick);

    const wrapper = document.createElement("div");
    wrapper.className = "framie-wrapper";

    this.iframe = document.createElement("iframe");
    this.iframe.className = "framie-iframe";
    this.iframe.src = this._buildUrl(url, context);
    this.iframe.setAttribute("title", "Framie Widget");
    this.iframe.setAttribute("referrerpolicy", "strict-origin-when-cross-origin");

    this.channel.attach(this.iframe);

    wrapper.appendChild(this.iframe);
    this.container.appendChild(this.backdrop);
    this.container.appendChild(wrapper);
    root.appendChild(this.container);

    document.addEventListener("keydown", this._onKeyDown);
    document.body.style.overflow = "hidden";
  }

  private _teardownDOM(): void {
    this.backdrop?.removeEventListener("click", this._onBackdropClick);
    this.channel.detach();
    this.container?.remove();
    this.container = null;
    this.backdrop = null;
    this.iframe = null;

    document.removeEventListener("keydown", this._onKeyDown);
    document.body.style.overflow = "";
  }

  private _buildUrl(url: string, context?: WidgetContext): string {
    if (!context || Object.keys(context).length === 0) return url;
    try {
      const parsed = new URL(url);
      Object.entries(context).forEach(([k, v]) => parsed.searchParams.set(k, String(v)));
      return parsed.toString();
    } catch {
      return url;
    }
  }

  private _validateUrl(url: string): void {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      throw new Error(`Framie: invalid URL "${url}"`);
    }
    if (!ALLOWED_PROTOCOLS.includes(parsed.protocol)) {
      throw new Error(`Framie: URL protocol "${parsed.protocol}" is not allowed. Only http: and https: are supported.`);
    }
  }
}

export function createWidget(options: FramieOptions): FramieWidget {
  return new FramieWidget(options);
}

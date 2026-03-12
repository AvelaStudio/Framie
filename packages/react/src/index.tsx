import {
  ChannelHandler,
  createWidget,
  FramieEventMap,
  FramieOptions,
  FramieWidget,
  RequestHandler,
  WidgetContext,
} from "@framie/core";
import * as React from "react";

export interface FramieHandle {
  getWidget(): FramieWidget;
  mount(context?: WidgetContext): void;
  unmount(): void;
  minimize(): void;
  restore(): void;
  destroy(): void;
}

export interface UseFramieStateOptions extends FramieOptions {
  open: boolean;
  context?: WidgetContext;
  /**
   * Destroy the widget instance when `open` becomes false.
   * By default the hook only calls `unmount()`, preserving the instance.
   */
  destroyOnClose?: boolean;
}

function shallowEqualOptions(left: FramieOptions | null, right: FramieOptions): boolean {
  if (!left) return false;

  const leftKeys = Object.keys(left) as Array<keyof FramieOptions>;
  const rightKeys = Object.keys(right) as Array<keyof FramieOptions>;
  if (leftKeys.length !== rightKeys.length) return false;

  for (const key of rightKeys) {
    if (!Object.is(left[key], right[key])) return false;
  }

  return true;
}

export function useFramie(options: FramieOptions): FramieHandle {
  const widgetRef = React.useRef<FramieWidget | null>(null);
  const latestOptionsRef = React.useRef(options);
  const widgetOptionsRef = React.useRef<FramieOptions | null>(null);
  const renderOptionsRef = React.useRef<FramieOptions | null>(null);
  const optionsVersionRef = React.useRef(0);

  if (!shallowEqualOptions(renderOptionsRef.current, options)) {
    renderOptionsRef.current = options;
    optionsVersionRef.current += 1;
  }

  const optionsVersion = optionsVersionRef.current;

  latestOptionsRef.current = options;

  const destroy = React.useCallback(() => {
    widgetRef.current?.destroy();
    widgetRef.current = null;
    widgetOptionsRef.current = null;
  }, []);

  const getWidget = React.useCallback(() => {
    const nextOptions = latestOptionsRef.current;

    if (!widgetRef.current || !shallowEqualOptions(widgetOptionsRef.current, nextOptions)) {
      widgetRef.current?.destroy();
      widgetRef.current = createWidget(nextOptions);
      widgetOptionsRef.current = nextOptions;
    }

    return widgetRef.current;
  }, []);

  const mount = React.useCallback(
    (context?: WidgetContext) => {
      getWidget().mount(context);
    },
    [getWidget],
  );

  const unmount = React.useCallback(() => {
    widgetRef.current?.unmount();
  }, []);

  const minimize = React.useCallback(() => {
    widgetRef.current?.minimize();
  }, []);

  const restore = React.useCallback(() => {
    widgetRef.current?.restore();
  }, []);

  React.useEffect(() => destroy, [destroy]);

  return React.useMemo(
    () => ({
      getWidget,
      mount,
      unmount,
      minimize,
      restore,
      destroy,
    }),
    [destroy, getWidget, minimize, mount, optionsVersion, restore, unmount],
  );
}

export function useFramieState(options: UseFramieStateOptions): FramieHandle {
  const { open, context, destroyOnClose = false, ...widgetOptions } = options;
  const framie = useFramie(widgetOptions);
  const previousOpenRef = React.useRef<boolean | null>(null);

  React.useEffect(() => {
    const widget = framie.getWidget();
    const wasOpen = previousOpenRef.current;

    if (open) {
      if (wasOpen !== true || widget.state === "idle" || widget.state === "unmounted") {
        framie.mount(context);
      }
    } else if (wasOpen === true) {
      if (destroyOnClose) {
        framie.destroy();
      } else {
        framie.unmount();
      }
    }

    previousOpenRef.current = open;
  }, [context, destroyOnClose, framie, open]);

  return framie;
}

export function useFramieEvent(
  framie: FramieHandle,
  event: keyof FramieEventMap,
  handler: () => void,
): void {
  const handlerRef = React.useRef(handler);
  handlerRef.current = handler;

  React.useEffect(() => {
    const widget = framie.getWidget();
    return widget.on(event, () => handlerRef.current());
  }, [event, framie]);
}

export function useFramieChannelEvent<T>(
  framie: FramieHandle,
  type: string,
  handler: ChannelHandler<T>,
): void {
  const handlerRef = React.useRef(handler);
  handlerRef.current = handler;

  React.useEffect(() => {
    const widget = framie.getWidget();
    return widget.channel.on<T>(type, (payload) => handlerRef.current(payload));
  }, [framie, type]);
}

export function useFramieRequestHandler<T = unknown, R = unknown>(
  framie: FramieHandle,
  type: string,
  handler: RequestHandler<T, R>,
): void {
  const handlerRef = React.useRef(handler);
  handlerRef.current = handler;

  React.useEffect(() => {
    const widget = framie.getWidget();
    return widget.channel.onRequest<T, R>(type, (payload) => handlerRef.current(payload));
  }, [framie, type]);
}

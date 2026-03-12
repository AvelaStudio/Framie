import { createWidget, FramieOptions, FramieWidget, WidgetContext } from "@framie/core";
import * as React from "react";

export interface FramieProviderProps extends FramieOptions {
  children: React.ReactNode;
  context?: WidgetContext;
}

export function useFramie(options: FramieOptions): FramieWidget {
  const ref = React.useRef<FramieWidget | null>(null);

  if (!ref.current) {
    ref.current = createWidget(options);
  }

  return ref.current;
}

export function FramieTrigger(props: FramieProviderProps): React.JSX.Element {
  const { children, context, ...options } = props;
  const widget = useFramie(options);

  return (
    <button type="button" onClick={() => widget.open(context)}>
      {children}
    </button>
  );
}

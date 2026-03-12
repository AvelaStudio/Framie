import * as React from "react";
import { useFramieEvent, useFramieState } from "../../packages/react/src";

export function ControlledCheckout(props: {
  open: boolean;
  cartId: string;
  onMounted?: () => void;
  onClosed?: () => void;
}): React.JSX.Element | null {
  const framie = useFramieState({
    url: "https://widget.example.com/checkout",
    open: props.open,
    context: { cartId: props.cartId },
    destroyOnClose: false,
  });

  useFramieEvent(framie, "mount", () => {
    props.onMounted?.();
  });

  useFramieEvent(framie, "unmount", () => {
    props.onClosed?.();
  });

  return null;
}

import * as React from "react";
import { useFramie, useFramieChannelEvent, useFramieRequestHandler } from "../../packages/react/src";

export function CheckoutLauncher(): React.JSX.Element {
  const framie = useFramie({
    url: "https://widget.example.com/checkout",
    mode: "modal",
    onError: (error) => {
      console.error(error);
      framie.destroy();
    },
  });

  useFramieChannelEvent<{ orderId: string }>(framie, "checkout:success", ({ orderId }) => {
    console.log("Checkout completed", orderId);
    framie.unmount();
  });

  useFramieRequestHandler(framie, "auth:get-token", async () => {
    return { token: "token_123" };
  });

  return (
    <button type="button" onClick={() => framie.mount({ cartId: "cart_1", locale: "en" })}>
      Open checkout
    </button>
  );
}

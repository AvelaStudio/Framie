import { createWidget } from "../../packages/core/src";

const widget = createWidget({
  url: "https://widget.example.com/checkout",
  mode: "modal",
  onAfterOpen: () => {
    console.log("Host: widget mounted");
  },
  onAfterClose: () => {
    console.log("Host: widget closed");
  },
  onError: (error) => {
    console.error("Host: handshake failed", error);
    widget.destroy();
  },
});

widget.channel.on<{ stage: string }>("checkout:stage-changed", ({ stage }) => {
  console.log("Host: stage changed", stage);
});

widget.channel.on<{ orderId: string }>("checkout:success", ({ orderId }) => {
  console.log("Host: success", orderId);
  widget.unmount();
});

widget.channel.onRequest<void, { token: string }>("auth:get-token", async () => {
  return { token: await getAccessToken() };
});

widget.channel.onRequest<{ sku: string }, { price: number }>("pricing:get", async ({ sku }) => {
  return { price: await getPrice(sku) };
});

document.querySelector<HTMLButtonElement>("#open-widget")?.addEventListener("click", () => {
  widget.mount({
    cartId: "cart_001",
    locale: "en",
    source: "checkout-page",
  });
});

async function getAccessToken(): Promise<string> {
  return "token_123";
}

async function getPrice(_sku: string): Promise<number> {
  return 2499;
}

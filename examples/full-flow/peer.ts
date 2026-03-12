import { PeerChannel } from "../../packages/peer/src";

const peer = new PeerChannel({
  allowedOrigin: "https://app.example.com",
  onError: (error: Error) => {
    console.error("Peer: handshake failed", error);
  },
});

peer.onRequest("checkout:get-initial-state", async () => {
  return {
    step: "shipping",
    currency: "USD",
  };
});

peer.on<{ theme: string }>("theme:set", ({ theme }: { theme: string }) => {
  document.documentElement.dataset.theme = theme;
});

async function bootstrap() {
  const auth = await peer.request<{ token: string }>("auth:get-token");
  const pricing = await peer.request<{ price: number }>("pricing:get", { sku: "sku_pro" });

  console.log("Peer: auth token", auth.token);
  console.log("Peer: price", pricing.price);

  peer.send("checkout:stage-changed", { stage: "payment" });
}

async function completeCheckout() {
  peer.send("checkout:success", { orderId: "order_123" });
}

peer.ready();
void bootstrap();

const payButton = document.querySelector<HTMLButtonElement>("#pay-now");
payButton?.addEventListener("click", () => {
  void completeCheckout();
});

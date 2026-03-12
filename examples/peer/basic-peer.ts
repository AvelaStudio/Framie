import { PeerChannel } from "../../packages/peer/src";

const peer = new PeerChannel({
  allowedOrigin: "https://app.example.com",
  requestTimeout: 5000,
  onError: (error: Error) => {
    console.error("Peer handshake error", error);
  },
});

peer.on<{ theme: string }>("theme:set", ({ theme }: { theme: string }) => {
  document.documentElement.dataset.theme = theme;
  peer.send("ui:theme-applied", { theme });
});

peer.onRequest("profile:get", async () => {
  return {
    name: "Alice",
    email: "alice@example.com",
  };
});

async function initializeCheckout() {
  const auth = await peer.request<{ token: string }>("auth:get-token");
  console.log("Received auth token", auth.token);

  peer.send("checkout:ready", { ok: true });
}

peer.ready();
void initializeCheckout();

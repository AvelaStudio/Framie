import { createWidget } from "../../packages/core/src";

const widget = createWidget({
  url: "https://widget.example.com/account",
});

widget.channel.on<{ orderId: string }>("checkout:success", ({ orderId }) => {
  console.log("Checkout finished", orderId);
  widget.unmount();
});

widget.channel.on<{ theme: string }>("ui:theme-applied", ({ theme }) => {
  console.log("Widget applied theme", theme);
});

widget.channel.onRequest<void, { token: string }>("auth:get-token", async () => {
  const token = await getAccessToken();
  return { token };
});

widget.channel.onRequest<{ sku: string }, { price: number }>(
  "product:get-price",
  async ({ sku }) => {
    const price = await fetchPrice(sku);
    return { price };
  },
);

async function loadProfile() {
  widget.mount({ userId: "u_42" });

  const profile = await widget.channel.request<{ name: string; email: string }>("profile:get", undefined, {
    timeoutMs: 3000,
  });

  console.log(profile.name, profile.email);
}

async function getAccessToken(): Promise<string> {
  return "token_123";
}

async function fetchPrice(_sku: string): Promise<number> {
  return 1999;
}

void loadProfile();

import { createWidget } from "../../packages/core/src";

const widget = createWidget({
  url: "https://widget.example.com/checkout",
  mode: "modal",
  closeOnBackdrop: true,
  closeOnEscape: true,
  onBeforeOpen: () => {
    console.log("Opening checkout widget");
  },
  onAfterOpen: () => {
    console.log("Checkout widget mounted");
  },
  onBeforeClose: () => {
    console.log("Closing checkout widget");
  },
  onAfterClose: () => {
    console.log("Checkout widget removed");
  },
  onError: (error) => {
    console.error("Framie handshake error", error);
    widget.destroy();
  },
});

widget.on("mount", () => {
  console.log("mount event emitted");
});

const openButton = document.querySelector<HTMLButtonElement>("#open-checkout");
const closeButton = document.querySelector<HTMLButtonElement>("#close-checkout");

openButton?.addEventListener("click", () => {
  widget.mount({
    cartId: "cart_123",
    locale: "en",
    source: "header",
  });
});

closeButton?.addEventListener("click", () => {
  widget.unmount();
});

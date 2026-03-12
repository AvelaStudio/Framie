import * as React from "react";
import {
  useFramie,
  useFramieChannelEvent,
  useFramieEvent,
  useFramieRequestHandler,
} from "../../packages/react/src";

export function MessagingExample(): React.JSX.Element {
  const framie = useFramie({
    url: "https://widget.example.com/support",
    mode: "bottomSheet",
  });

  useFramieEvent(framie, "mount", () => {
    console.log("Support widget mounted");
  });

  useFramieChannelEvent<{ unreadCount: number }>(framie, "support:badge", ({ unreadCount }) => {
    console.log("Unread messages", unreadCount);
  });

  useFramieRequestHandler<{ locale: string }, { articles: Array<{ id: string; title: string }> }>(
    framie,
    "help:list-articles",
    async ({ locale }) => {
      return {
        articles: [
          { id: "a1", title: `Welcome (${locale})` },
          { id: "a2", title: `Pricing (${locale})` },
        ],
      };
    },
  );

  return (
    <div>
      <button type="button" onClick={() => framie.mount({ locale: "en" })}>
        Open support
      </button>
      <button type="button" onClick={() => framie.minimize()}>
        Minimize
      </button>
      <button type="button" onClick={() => framie.restore()}>
        Restore
      </button>
      <button type="button" onClick={() => framie.unmount()}>
        Close
      </button>
    </div>
  );
}

# Examples

This directory contains integration-oriented examples for all Framie packages.

## Structure

- `core/basic-widget.ts`: minimal host-side widget usage with lifecycle callbacks.
- `core/host-rpc.ts`: host-side event subscriptions and request handlers.
- `peer/basic-peer.ts`: iframe-side bootstrap with `PeerChannel`.
- `react/basic-launcher.tsx`: explicit React launch button using `useFramie()`.
- `react/controlled-widget.tsx`: controlled React integration using `useFramieState()`.
- `react/channel-subscriptions.tsx`: React subscription hooks for widget lifecycle and channel messages.
- `full-flow/host.ts`: host-side end-to-end checkout flow.
- `full-flow/peer.ts`: iframe-side end-to-end checkout flow.

These examples are intentionally framework-light and are designed to show API usage, not app scaffolding.

Inside this monorepo, examples import from `packages/*/src` so they always track the current workspace source instead of published package artifacts.

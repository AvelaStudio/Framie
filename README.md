# Framie

Framie is an iframe widget SDK for building embedded products with a strict host/iframe contract.

It is split into three packages:

- `@framie/core`: host-side widget lifecycle, DOM mounting, iframe transport, handshake, typed messaging.
- `@framie/peer`: iframe-side transport for code running inside the embedded app.
- `@framie/react`: React bindings on top of `@framie/core`.

## What Framie Solves

Framie gives you:

- a host-side widget object that mounts and unmounts an iframe safely
- a message bus over `postMessage`
- request/response RPC on top of events
- bidirectional handshake with protocol version checks
- buffering on the host until the iframe is actually ready
- React ergonomics without hiding the underlying imperative widget

Typical use case:

1. The host app opens an iframe widget.
2. The iframe bootstraps its own app.
3. Both sides communicate through typed events and typed requests.

## Installation

Install the packages you need.

```bash
npm install @framie/core
```

```bash
npm install @framie/core @framie/react
```

```bash
npm install @framie/core @framie/peer
```

For this monorepo itself:

```bash
npm install
npm run build
```

## Examples

Ready-to-copy examples live in [examples/README.md](/Users/grigorijlysenkov/projects/framie/examples/README.md).

Use them as starting points for:

- host-side widget control with `@framie/core`
- iframe-side messaging with `@framie/peer`
- React integration with `@framie/react`
- end-to-end host/iframe flows

## Architecture

Framie uses a host/peer model.

- Host page: creates and controls the widget with `@framie/core`
- Iframe app: joins the channel with `@framie/peer`

Handshake flow:

1. Host mounts an iframe.
2. On iframe `load`, host sends `__framie:hello` with `sdkVersion` and `protocolVersion`.
3. Peer app calls `peer.ready()`.
4. Peer sends `__framie:ready` with its own version payload.
5. Host validates protocol compatibility.
6. If compatible, queued host messages are flushed.
7. If incompatible, `onError` is called and the queue remains blocked.

Important behavior:

- Host `send()` and `request()` calls are buffered until the peer is ready.
- Peer `ready()` is not buffered. It is the readiness signal.
- A protocol mismatch is treated as a hard integration error.

## Quick Start

### Host Side With `@framie/core`

```ts
import { createWidget } from "@framie/core";

const widget = createWidget({
	url: "https://widget.example.com",
	mode: "modal",
	onAfterOpen: () => {
		console.log("widget opened");
	},
	onAfterClose: () => {
		console.log("widget closed");
	},
	onError: (error) => {
		console.error("framie error", error);
		widget.destroy();
	},
});

widget.mount({
	userId: "u_123",
	plan: "pro",
});
```

### Iframe Side With `@framie/peer`

```ts
import { PeerChannel } from "@framie/peer";

const peer = new PeerChannel({
	allowedOrigin: "https://app.example.com",
	onError: (error) => {
		console.error("protocol mismatch", error);
	},
});

peer.on("theme:set", ({ theme }) => {
	document.documentElement.dataset.theme = theme;
});

peer.onRequest("auth:get-token", async () => {
	return { token: "abc123" };
});

peer.ready();
```

### React Host Side With `@framie/react`

```tsx
import * as React from "react";
import { useFramie } from "@framie/react";

export function CheckoutButton() {
	const framie = useFramie({
		url: "https://widget.example.com",
		onError: (error) => {
			console.error(error);
			framie.destroy();
		},
	});

	return (
		<button type="button" onClick={() => framie.mount({ cartId: "cart_1" })}>
			Open checkout
		</button>
	);
}
```

## `@framie/core`

`@framie/core` is the host-side package.

### Exports

```ts
import {
	createWidget,
	FramieWidget,
	FramieChannel,
	HandshakeError,
} from "@framie/core";
```

### `createWidget(options)`

Creates a `FramieWidget`.

```ts
const widget = createWidget({ url: "https://widget.example.com" });
```

### `FramieOptions`

```ts
interface FramieOptions {
	url: string;
	mode?: "modal" | "bottomSheet";
	container?: HTMLElement;
	closeOnBackdrop?: boolean;
	closeOnEscape?: boolean;
	onBeforeMount?: () => void;
	onMount?: () => void;
	onBeforeUnmount?: () => void;
	onUnmount?: () => void;
	onMinimize?: () => void;
	onRestore?: () => void;
	onBeforeOpen?: () => void;
	onAfterOpen?: () => void;
	onBeforeClose?: () => void;
	onAfterClose?: () => void;
	onError?: (error: Error) => void;
}
```

Notes:

- `url` must use `http:` or `https:`.
- `container` defaults to `document.body`.
- `context` is not part of `FramieOptions`; it is passed to `mount(context)`.
- `onBeforeOpen` and `onAfterOpen` are product-facing aliases for mount lifecycle.
- `onBeforeClose` and `onAfterClose` are product-facing aliases for unmount lifecycle.

### `FramieWidget`

Main host-side controller.

#### Properties

- `state: WidgetState`
- `channel: FramieChannel`

`WidgetState` values:

```ts
"idle" | "mounting" | "mounted" | "minimized" | "unmounting" | "unmounted" | "destroyed"
```

#### Methods

##### `mount(context?)`

Creates DOM, inserts the iframe, attaches the channel, starts the handshake.

```ts
widget.mount({ userId: "u1", plan: "pro" });
```

Behavior:

- `context` is appended to the iframe URL as query params.
- calling `mount()` when already mounted is a no-op.

##### `unmount()`

Removes the widget DOM and detaches the channel.

```ts
widget.unmount();
```

##### `minimize()`

Hides the widget without destroying it.

```ts
widget.minimize();
```

##### `restore()`

Restores the widget from the minimized state.

```ts
widget.restore();
```

##### `destroy()`

Final teardown. Rejects pending requests, removes listeners, and permanently disables the widget instance.

```ts
widget.destroy();
```

##### `on(event, handler)` / `off(event, handler)` / `once(event, handler)`

Lifecycle event emitter.

Events:

```ts
type FramieEventMap = {
	beforeMount: void;
	mount: void;
	beforeUnmount: void;
	unmount: void;
	minimize: void;
	restore: void;
	destroy: void;
};
```

Example:

```ts
const off = widget.on("mount", () => {
	console.log("mounted");
});

off();
```

### `FramieChannel`

The transport object exposed at `widget.channel`.

#### Host-side guarantees

- outgoing messages are sent only to `targetOrigin`
- incoming messages are accepted only from the mounted iframe window
- non-Framie messages are ignored

#### `send(type, payload?)`

Fire-and-forget event to the peer.

```ts
widget.channel.send("theme:set", { theme: "light" });
```

If the peer is not ready yet, the message is buffered.

#### `request(type, payload?, options?)`

Send a request and await a response.

```ts
const profile = await widget.channel.request<{ name: string }>("profile:get");
```

With timeout and cancellation:

```ts
const controller = new AbortController();

const result = await widget.channel.request<{ ok: boolean }>(
	"checkout:validate",
	{ coupon: "SAVE10" },
	{
		timeoutMs: 3000,
		signal: controller.signal,
	},
);
```

`RequestOptions`:

```ts
interface RequestOptions {
	timeoutMs?: number;
	signal?: AbortSignal;
}
```

#### `on(type, handler)` / `off(type, handler)`

Subscribe to a regular peer message.

```ts
const off = widget.channel.on<{ orderId: string }>("checkout:success", ({ orderId }) => {
	console.log(orderId);
});
```

#### `onRequest(type, handler)`

Register a host-side RPC handler for peer-initiated requests.

```ts
const off = widget.channel.onRequest<{ sku: string }, { price: number }>(
	"product:get-price",
	async ({ sku }) => {
		return { price: await fetchPrice(sku) };
	},
);
```

#### `isReady`

Whether the peer handshake has completed successfully.

### Protocol Exports

Advanced protocol symbols are exported from `@framie/core` as well:

```ts
FRAMIE_MARKER
HELLO_EVENT
READY_EVENT
PROTOCOL_VERSION
SDK_VERSION
HandshakeError
```

These are useful for testing, diagnostics, or very low-level integrations.

## `@framie/peer`

`@framie/peer` is the iframe-side package.

### Exports

```ts
import { PeerChannel, HandshakeError } from "@framie/peer";
```

### `PeerChannelOptions`

```ts
interface PeerChannelOptions {
	allowedOrigin: string;
	requestTimeout?: number;
	sdkVersion?: string;
	onError?: (error: Error) => void;
}
```

Notes:

- `allowedOrigin` is the expected host origin.
- use `"*"` only in trusted or development-only scenarios.
- `onError` is called when the host sends an incompatible protocol version.

### `PeerChannel`

#### `ready()`

Signals that the iframe app is ready and completes the handshake from the peer side.

```ts
peer.ready();
```

Call this after your iframe app is initialized enough to receive messages.

#### `send(type, payload?)`

Send an event to the host.

```ts
peer.send("checkout:success", { orderId: "o_1" });
```

#### `request(type, payload?, options?)`

Send an RPC request to the host.

```ts
const token = await peer.request<{ token: string }>("auth:get-token");
```

`PeerRequestOptions`:

```ts
interface PeerRequestOptions {
	timeoutMs?: number;
	signal?: AbortSignal;
}
```

#### `on(type, handler)` / `off(type, handler)`

Subscribe to host events.

```ts
const off = peer.on<{ theme: string }>("theme:set", ({ theme }) => {
	document.documentElement.dataset.theme = theme;
});
```

#### `onRequest(type, handler)`

Register an iframe-side RPC handler.

```ts
peer.onRequest("profile:get", async () => {
	return { name: "Alice" };
});
```

#### `destroy()`

Removes listeners and rejects pending requests.

```ts
peer.destroy();
```

## `@framie/react`

`@framie/react` keeps the widget imperative, but makes it easy to integrate into React lifecycles.

### Exports

```ts
import {
	useFramie,
	useFramieState,
	useFramieEvent,
	useFramieChannelEvent,
	useFramieRequestHandler,
} from "@framie/react";
```

### `useFramie(options)`

Returns a stable controller handle.

```tsx
const framie = useFramie({
	url: "https://widget.example.com",
});
```

Handle API:

```ts
interface FramieHandle {
	getWidget(): FramieWidget;
	mount(context?: WidgetContext): void;
	unmount(): void;
	minimize(): void;
	restore(): void;
	destroy(): void;
}
```

Behavior:

- widget creation is lazy
- the same widget instance is reused while options are shallow-equal
- if options change, the previous widget is destroyed and a fresh one is created
- on React unmount, the widget is destroyed automatically

Example:

```tsx
function BillingButton() {
	const framie = useFramie({ url: "https://billing.example.com" });

	return (
		<button type="button" onClick={() => framie.mount({ customerId: "c_42" })}>
			Open billing
		</button>
	);
}
```

### `useFramieState({ open, context, ...options })`

Controlled React wrapper around `useFramie`.

```tsx
function ControlledWidget({ open }: { open: boolean }) {
	const framie = useFramieState({
		url: "https://widget.example.com",
		open,
		context: { source: "sidebar" },
	});

	return null;
}
```

Options:

```ts
interface UseFramieStateOptions extends FramieOptions {
	open: boolean;
	context?: WidgetContext;
	destroyOnClose?: boolean;
}
```

Notes:

- `open: true` mounts the widget
- `open: false` unmounts it
- with `destroyOnClose: true`, the instance is destroyed instead of just unmounted
- `context` is applied when the widget transitions into the open state

### `useFramieEvent(framie, event, handler)`

Subscribe to widget lifecycle events from React.

```tsx
function Example() {
	const framie = useFramie({ url: "https://widget.example.com" });

	useFramieEvent(framie, "mount", () => {
		console.log("widget mounted");
	});

	return <button onClick={() => framie.mount()}>Open</button>;
}
```

### `useFramieChannelEvent(framie, type, handler)`

Subscribe to peer-to-host messages from React.

```tsx
function Example() {
	const framie = useFramie({ url: "https://widget.example.com" });

	useFramieChannelEvent<{ orderId: string }>(framie, "checkout:success", ({ orderId }) => {
		console.log(orderId);
		framie.unmount();
	});

	return <button onClick={() => framie.mount()}>Open</button>;
}
```

### `useFramieRequestHandler(framie, type, handler)`

Register host-side request handlers from React.

```tsx
function Example() {
	const framie = useFramie({ url: "https://widget.example.com" });

	useFramieRequestHandler(framie, "auth:get-token", async () => {
		return { token: await getAccessToken() };
	});

	return <button onClick={() => framie.mount()}>Open</button>;
}
```

## End-to-End Example

### Host

```ts
import { createWidget } from "@framie/core";

const widget = createWidget({
	url: "https://widget.example.com/checkout",
	onAfterOpen: () => console.log("opened"),
	onError: (error) => {
		console.error(error);
		widget.destroy();
	},
});

widget.channel.on("checkout:success", ({ orderId }) => {
	console.log("success", orderId);
	widget.unmount();
});

widget.channel.onRequest("auth:get-token", async () => {
	return { token: await getAccessToken() };
});

document.querySelector("#open-checkout")?.addEventListener("click", () => {
	widget.mount({ cartId: "cart_1", locale: "en" });
});
```

### Iframe App

```ts
import { PeerChannel } from "@framie/peer";

const peer = new PeerChannel({
	allowedOrigin: "https://app.example.com",
});

peer.onRequest("checkout:get-draft", async () => {
	return { items: [] };
});

async function finishCheckout() {
	const auth = await peer.request<{ token: string }>("auth:get-token");
	console.log(auth.token);

	peer.send("checkout:success", { orderId: "ord_123" });
}

peer.ready();
```

## Security Model

Framie is strict by default.

- Host only accepts messages from the configured origin.
- Host only accepts messages from the exact mounted iframe window.
- Peer only accepts messages from `allowedOrigin` unless configured with `"*"`.
- Non-Framie `postMessage` traffic is ignored.

Still recommended:

- always set a precise `url`
- always use a precise `allowedOrigin`
- avoid `"*"` outside development or highly trusted environments
- keep `@framie/core` and `@framie/peer` versions aligned

## Common Patterns

### Open With Context

```ts
widget.mount({
	userId: "u1",
	locale: "ru",
	feature: "upsell",
});
```

This becomes query params on the iframe URL.

### Fire-And-Forget Commands

```ts
widget.channel.send("ui:set-theme", { theme: "dark" });
peer.send("analytics:event", { name: "checkout_started" });
```

### Typed RPC

```ts
const coupon = await widget.channel.request<{ valid: boolean }>("coupon:validate", {
	code: "SAVE10",
});
```

```ts
peer.onRequest("product:get-price", async ({ sku }) => {
	return { price: await fetchPrice(sku) };
});
```

### React Controlled Mode

```tsx
function Example({ open }: { open: boolean }) {
	useFramieState({
		url: "https://widget.example.com",
		open,
		destroyOnClose: false,
	});

	return null;
}
```

## Development Commands

```bash
npm run build
npm run typecheck
npm run test
npm run coverage
npm run dev
```

## Current Status

The monorepo currently has:

- host widget lifecycle in `@framie/core`
- typed messaging and RPC in `@framie/core` and `@framie/peer`
- handshake and protocol version validation
- React integration built around explicit `mount()` control

`@framie/react` intentionally does not hide the widget behind a declarative component. The recommended model is: keep widget control explicit and call `mount()` from application code when the UI wants to open the iframe.

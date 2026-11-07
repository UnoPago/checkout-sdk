/** Every message the checkout iframe posts to its parent carries this `source`. */
export const CHECKOUT_EMBED_MESSAGE_SOURCE = "unopago-checkout";

/**
 * What the checkout iframe posts to `window.parent`:
 *
 * - `ready`: the page loaded.
 * - `resize`: the content's height changed, in pixels.
 * - `success`: the session became `PAID`. A user-interface signal only —
 *   confirm it server-side before fulfilling.
 */
export type CheckoutEmbedMessage =
  | { source: typeof CHECKOUT_EMBED_MESSAGE_SOURCE; type: "ready" }
  | {
      source: typeof CHECKOUT_EMBED_MESSAGE_SOURCE;
      type: "resize";
      height: number;
    }
  | { source: typeof CHECKOUT_EMBED_MESSAGE_SOURCE; type: "success" };

export type CheckoutEmbedMountOptions = {
  /**
   * The signed URL from `checkoutSessions.create()`'s `iframeUrl`. Treat it as
   * opaque: the SDK never parses, stores, or logs it.
   */
  iframeUrl: string;
  /** The iframe's accessible title. Defaults to `"Pago"`. */
  title?: string;
  /** The checkout page loaded. */
  onReady?: () => void;
  /**
   * The content's height changed. The SDK already applies it to the iframe;
   * use this only when your own layout needs the value too.
   */
  onResize?: (height: number) => void;
  /**
   * The session became `PAID`. This is a UX signal, not proof of payment:
   * confirm it with the `checkout_session_paid` webhook or
   * `checkoutSessions.get()` before fulfilling.
   */
  onSuccess?: () => void;
};

export type CheckoutEmbedHandle = {
  /** The element the SDK created, in case your layout needs a reference. */
  readonly iframe: HTMLIFrameElement;
  /** Removes the listener and the iframe. Safe to call more than once. */
  unmount(): void;
};

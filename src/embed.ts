import {
  CHECKOUT_EMBED_MESSAGE_SOURCE,
  type CheckoutEmbedHandle,
  type CheckoutEmbedMessage,
  type CheckoutEmbedMountOptions,
} from "./embedTypes";

/**
 * What `CheckoutPaymentForm` needs: scripts and forms for the payment form,
 * and its own origin for the API calls and storage. The checkout never opens
 * a popup or navigates the top window, so neither is allowed.
 */
const CHECKOUT_EMBED_SANDBOX = "allow-forms allow-same-origin allow-scripts";

/**
 * Narrows an untrusted `message` payload to one of the checkout's events.
 * Rebuilds the object so a caller never sees fields the checkout did not send.
 */
function toCheckoutEmbedMessage(data: unknown): CheckoutEmbedMessage | null {
  if (typeof data !== "object" || data === null) return null;
  if (!("source" in data) || data.source !== CHECKOUT_EMBED_MESSAGE_SOURCE) {
    return null;
  }
  if (!("type" in data)) return null;

  switch (data.type) {
    case "ready":
      return { source: CHECKOUT_EMBED_MESSAGE_SOURCE, type: "ready" };
    case "success":
      return { source: CHECKOUT_EMBED_MESSAGE_SOURCE, type: "success" };
    case "resize":
      if (
        !("height" in data) ||
        typeof data.height !== "number" ||
        !Number.isFinite(data.height) ||
        data.height < 0
      ) {
        return null;
      }
      return {
        source: CHECKOUT_EMBED_MESSAGE_SOURCE,
        type: "resize",
        height: data.height,
      };
    default:
      return null;
  }
}

/**
 * Mounts the UnoPago checkout as an iframe inside `container`.
 *
 * The helper creates the element with the right security attributes, attaches
 * its `message` listener before the URL loads, and only trusts a message that
 * comes from the iframe's origin, from the iframe itself, and carries
 * `source: "unopago-checkout"`. `resize` messages are applied to the iframe's
 * height automatically.
 *
 * The signed `iframeUrl` lives only in this closure and in the iframe's `src`;
 * the helper never persists or logs it.
 */
export function mountCheckoutEmbed(
  container: HTMLElement,
  options: CheckoutEmbedMountOptions,
): CheckoutEmbedHandle {
  // Throws on a malformed URL, before anything is mounted.
  const url = new URL(options.iframeUrl);
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error(`iframeUrl must use http or https, got ${url.protocol}`);
  }
  const expectedOrigin = url.origin;

  const iframe = document.createElement("iframe");
  iframe.title = options.title ?? "Pago";
  iframe.style.width = "100%";
  iframe.style.border = "0px";
  iframe.setAttribute("referrerpolicy", "no-referrer");
  iframe.setAttribute("sandbox", CHECKOUT_EMBED_SANDBOX);

  const onMessage = (event: MessageEvent) => {
    if (event.origin !== expectedOrigin) return;
    if (event.source !== iframe.contentWindow) return;

    const message = toCheckoutEmbedMessage(event.data);
    if (message === null) return;

    switch (message.type) {
      case "ready":
        options.onReady?.();
        return;
      case "resize":
        iframe.style.height = `${message.height}px`;
        options.onResize?.(message.height);
        return;
      case "success":
        options.onSuccess?.();
        return;
    }
  };

  container.appendChild(iframe);
  window.addEventListener("message", onMessage);
  iframe.src = options.iframeUrl;

  let mounted = true;
  return {
    iframe,
    unmount() {
      if (!mounted) return;
      mounted = false;
      window.removeEventListener("message", onMessage);
      iframe.remove();
    },
  };
}

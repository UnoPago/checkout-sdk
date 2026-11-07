// @vitest-environment jsdom
import { beforeEach, describe, expect, test, vi } from "vitest";
import { mountCheckoutEmbed } from "../embed";
import { CHECKOUT_EMBED_MESSAGE_SOURCE } from "../embedTypes";

const IFRAME_URL =
  "https://checkout.unopago.com/embed/pay/token?payload=eyJ2IjoxfQ&sig=abc";
const IFRAME_ORIGIN = "https://checkout.unopago.com";

function getContainer(): HTMLElement {
  const element = document.getElementById("checkout");
  if (!(element instanceof HTMLElement)) {
    throw new Error("missing container");
  }
  return element;
}

function dispatchFrom(
  iframe: HTMLIFrameElement,
  data: unknown,
  options: { origin?: string; source?: Window | null } = {},
): void {
  const event = new MessageEvent("message", {
    data,
    origin: options.origin ?? IFRAME_ORIGIN,
    source:
      options.source === undefined ? iframe.contentWindow : options.source,
  });
  window.dispatchEvent(event);
}

beforeEach(() => {
  document.body.innerHTML = '<div id="checkout"></div>';
});

describe("mountCheckoutEmbed", () => {
  test("mounts one iframe with the expected attributes", () => {
    const embed = mountCheckoutEmbed(getContainer(), { iframeUrl: IFRAME_URL });
    const frame = embed.iframe;

    expect(getContainer().children).toHaveLength(1);
    expect(getContainer().firstElementChild).toBe(frame);
    expect(frame.title).toBe("Pago");
    expect(frame.getAttribute("src")).toBe(IFRAME_URL);
    expect(frame.getAttribute("referrerpolicy")).toBe("no-referrer");
    expect(frame.getAttribute("sandbox")).toBe(
      "allow-forms allow-same-origin allow-scripts",
    );
    expect(frame.style.width).toBe("100%");
    expect(frame.style.border).toBe("0px");
  });

  test("uses the given title", () => {
    const embed = mountCheckoutEmbed(getContainer(), {
      iframeUrl: IFRAME_URL,
      title: "Pagar matrícula",
    });

    expect(embed.iframe.title).toBe("Pagar matrícula");
  });

  test("dispatches ready, resize and success once each", () => {
    const onReady = vi.fn();
    const onResize = vi.fn();
    const onSuccess = vi.fn();
    const embed = mountCheckoutEmbed(getContainer(), {
      iframeUrl: IFRAME_URL,
      onReady,
      onResize,
      onSuccess,
    });
    const frame = embed.iframe;

    dispatchFrom(frame, {
      source: CHECKOUT_EMBED_MESSAGE_SOURCE,
      type: "ready",
    });
    expect(onReady).toHaveBeenCalledTimes(1);

    dispatchFrom(frame, {
      source: CHECKOUT_EMBED_MESSAGE_SOURCE,
      type: "resize",
      height: 420,
    });
    expect(onResize).toHaveBeenCalledTimes(1);
    expect(onResize).toHaveBeenCalledWith(420);
    expect(frame.style.height).toBe("420px");

    dispatchFrom(frame, {
      source: CHECKOUT_EMBED_MESSAGE_SOURCE,
      type: "success",
    });
    expect(onSuccess).toHaveBeenCalledTimes(1);
  });

  test("ignores a message from the wrong origin", () => {
    const onReady = vi.fn();
    const embed = mountCheckoutEmbed(getContainer(), {
      iframeUrl: IFRAME_URL,
      onReady,
    });

    dispatchFrom(
      embed.iframe,
      { source: CHECKOUT_EMBED_MESSAGE_SOURCE, type: "ready" },
      { origin: "https://evil.example" },
    );

    expect(onReady).not.toHaveBeenCalled();
  });

  test("ignores a message from a different source window", () => {
    const onReady = vi.fn();
    const embed = mountCheckoutEmbed(getContainer(), {
      iframeUrl: IFRAME_URL,
      onReady,
    });

    dispatchFrom(
      embed.iframe,
      { source: CHECKOUT_EMBED_MESSAGE_SOURCE, type: "ready" },
      { source: window },
    );

    expect(onReady).not.toHaveBeenCalled();
  });

  test("ignores a payload without the checkout source or a known type", () => {
    const onReady = vi.fn();
    const onResize = vi.fn();
    const embed = mountCheckoutEmbed(getContainer(), {
      iframeUrl: IFRAME_URL,
      onReady,
      onResize,
    });
    const frame = embed.iframe;

    dispatchFrom(frame, { type: "ready" });
    dispatchFrom(frame, { source: "other", type: "ready" });
    dispatchFrom(frame, { source: CHECKOUT_EMBED_MESSAGE_SOURCE });
    dispatchFrom(frame, {
      source: CHECKOUT_EMBED_MESSAGE_SOURCE,
      type: "processing",
    });
    dispatchFrom(frame, null);
    dispatchFrom(frame, "ready");

    expect(onReady).not.toHaveBeenCalled();
    expect(onResize).not.toHaveBeenCalled();
    expect(frame.style.height).toBe("");
  });

  test("ignores a resize without a usable height", () => {
    const onResize = vi.fn();
    const embed = mountCheckoutEmbed(getContainer(), {
      iframeUrl: IFRAME_URL,
      onResize,
    });
    const frame = embed.iframe;

    dispatchFrom(frame, {
      source: CHECKOUT_EMBED_MESSAGE_SOURCE,
      type: "resize",
      height: "420",
    });
    dispatchFrom(frame, {
      source: CHECKOUT_EMBED_MESSAGE_SOURCE,
      type: "resize",
      height: -1,
    });
    dispatchFrom(frame, {
      source: CHECKOUT_EMBED_MESSAGE_SOURCE,
      type: "resize",
      height: Number.NaN,
    });

    expect(onResize).not.toHaveBeenCalled();
    expect(frame.style.height).toBe("");
  });

  test("unmount removes the iframe and the listener", () => {
    const onReady = vi.fn();
    const onSuccess = vi.fn();
    const embed = mountCheckoutEmbed(getContainer(), {
      iframeUrl: IFRAME_URL,
      onReady,
      onSuccess,
    });
    const frame = embed.iframe;

    embed.unmount();

    expect(getContainer().children).toHaveLength(0);
    dispatchFrom(frame, {
      source: CHECKOUT_EMBED_MESSAGE_SOURCE,
      type: "ready",
    });
    dispatchFrom(frame, {
      source: CHECKOUT_EMBED_MESSAGE_SOURCE,
      type: "success",
    });
    expect(onReady).not.toHaveBeenCalled();
    expect(onSuccess).not.toHaveBeenCalled();

    // A second unmount is a no-op.
    embed.unmount();
  });

  test("throws on a malformed iframe URL before mounting anything", () => {
    expect(() =>
      mountCheckoutEmbed(getContainer(), { iframeUrl: "not a url" }),
    ).toThrow();

    expect(getContainer().children).toHaveLength(0);
  });

  test("rejects a non-http(s) iframe URL", () => {
    for (const iframeUrl of [
      "javascript:alert(1)",
      "data:text/html,<p>hola</p>",
    ]) {
      expect(() => mountCheckoutEmbed(getContainer(), { iframeUrl })).toThrow();
    }

    expect(getContainer().children).toHaveLength(0);
  });
});

import { createHmac, timingSafeEqual } from "node:crypto";
import {
  checkoutSessionCanceledEventSchema,
  checkoutSessionExpiredEventSchema,
  checkoutSessionPaidEventSchema,
  checkoutWebhookEnvelopeSchema,
  type CheckoutWebhookEvent,
} from "./webhookTypes";

/** How far a delivery's timestamp may drift from now, in seconds. */
export const DEFAULT_CHECKOUT_WEBHOOK_TOLERANCE_SECONDS = 300;

/** The `v1` signature is a hex HMAC-SHA256 digest. */
const SIGNATURE_PATTERN = /^[0-9a-f]{64}$/i;

/** A delivery whose signature, header or timestamp cannot be trusted. */
export class InvalidWebhookSignatureError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidWebhookSignatureError";
  }
}

export type VerifyCheckoutWebhookSignatureInput = {
  /** The RAW body, before `JSON.parse`: a Buffer or the string as received. */
  payload: Buffer | string;
  /** The `Webhook-Signature` header, e.g. `t=1761235200,v1=5257…`. */
  header: string;
  /** The endpoint's signing secret, shown when it was created. */
  secret: string;
  /**
   * How far a delivery's `t` may be from now, in either direction, before it
   * is refused as a replay. Defaults to 300 seconds.
   */
  toleranceSeconds?: number;
};

type ParsedSignatureHeader = {
  /** The raw `t` value, which is what the HMAC covers. */
  timestampText: string;
  timestamp: number;
  signature: string;
};

function parseSignatureHeader(header: string): ParsedSignatureHeader {
  let timestampText: string | undefined;
  let signature: string | undefined;

  for (const part of header.split(",")) {
    const separator = part.indexOf("=");
    if (separator === -1) continue;
    const key = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    if (key === "t") timestampText = value;
    if (key === "v1") signature = value;
  }

  if (timestampText === undefined || !/^\d+$/.test(timestampText)) {
    throw new InvalidWebhookSignatureError(
      "Malformed Webhook-Signature header: `t` is missing or not a Unix timestamp.",
    );
  }
  if (signature === undefined || !SIGNATURE_PATTERN.test(signature)) {
    throw new InvalidWebhookSignatureError(
      "Malformed Webhook-Signature header: `v1` is missing or not a hex SHA-256 digest.",
    );
  }

  return {
    timestampText,
    timestamp: Number(timestampText),
    signature,
  };
}

/**
 * Verifies a `Webhook-Signature` header and returns the parsed, typed event.
 *
 * The signature is `HMAC-SHA256(secret, "<t>.<rawBody>")` in hex, exactly as
 * the API guide documents it. A delivery whose timestamp is more than
 * `toleranceSeconds` away from now (past or future) is refused to block
 * replay. An event type this SDK version does not know is returned with
 * `known: false` and an `unknown` `data`, instead of thrown.
 *
 * Throws {@link InvalidWebhookSignatureError} for a bad signature, a malformed
 * header or a stale or future timestamp, a `SyntaxError` for a body that is
 * not JSON, and a `ZodError` for one that does not match the envelope.
 */
export function verifyCheckoutWebhookSignature(
  input: VerifyCheckoutWebhookSignatureInput,
): CheckoutWebhookEvent {
  if (input.secret.trim() === "") {
    throw new InvalidWebhookSignatureError("Webhook secret is empty.");
  }

  const { timestampText, timestamp, signature } = parseSignatureHeader(
    input.header,
  );
  const toleranceSeconds =
    input.toleranceSeconds ?? DEFAULT_CHECKOUT_WEBHOOK_TOLERANCE_SECONDS;

  const ageSeconds = Math.floor(Date.now() / 1000) - timestamp;
  if (Math.abs(ageSeconds) > toleranceSeconds) {
    throw new InvalidWebhookSignatureError(
      `Webhook timestamp is more than ${toleranceSeconds} seconds away from now.`,
    );
  }

  const expected = createHmac("sha256", input.secret)
    .update(`${timestampText}.`)
    .update(input.payload)
    .digest("hex");

  const expectedBytes = Buffer.from(expected, "hex");
  const receivedBytes = Buffer.from(signature, "hex");
  if (
    expectedBytes.length !== receivedBytes.length ||
    !timingSafeEqual(expectedBytes, receivedBytes)
  ) {
    throw new InvalidWebhookSignatureError(
      "Webhook signature does not match the payload.",
    );
  }

  const raw: unknown = JSON.parse(
    typeof input.payload === "string"
      ? input.payload
      : input.payload.toString("utf8"),
  );
  const envelope = checkoutWebhookEnvelopeSchema.parse(raw);

  switch (envelope.eventType) {
    case "checkout_session_paid":
      return { known: true, ...checkoutSessionPaidEventSchema.parse(raw) };
    case "checkout_session_expired":
      return { known: true, ...checkoutSessionExpiredEventSchema.parse(raw) };
    case "checkout_session_canceled":
      return { known: true, ...checkoutSessionCanceledEventSchema.parse(raw) };
    default:
      return { known: false, ...envelope };
  }
}

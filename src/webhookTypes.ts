import { z } from "zod";
import { checkoutSessionBaseSchema, type CheckoutSessionBase } from "./types";

/** Where UnoPago created the session. */
export const checkoutSessionProviderSchema = z.enum([
  "API",
  "SHOPIFY",
  "STOREFRONT",
]);

export type CheckoutSessionProvider = z.infer<
  typeof checkoutSessionProviderSchema
>;

/**
 * The session as a `checkout_session_*` webhook carries it: the REST session
 * without `url` and `iframeUrl`, plus the webhook-only fields.
 */
export type CheckoutSessionWebhookPayload = CheckoutSessionBase & {
  /** Where UnoPago created the session. */
  provider: CheckoutSessionProvider;
  /** The invoice a paid session issued. `null` on expired and canceled ones. */
  invoiceId: string | null;
  /** The payment a paid session recorded. `null` on expired and canceled ones. */
  paymentId: string | null;
  /** Reserved, for telling a test sale from a real one. Always `false` today. */
  test: boolean;
};

export const checkoutSessionWebhookPayloadSchema =
  checkoutSessionBaseSchema.extend({
    provider: checkoutSessionProviderSchema,
    invoiceId: z.string().nullable(),
    paymentId: z.string().nullable(),
    test: z.boolean(),
  }) satisfies z.ZodType<CheckoutSessionWebhookPayload>;

const checkoutSessionWebhookDataSchema = z.object({
  checkoutSession: checkoutSessionWebhookPayloadSchema,
});

/**
 * The envelope every UnoPago webhook shares. `createdAt` is ISO 8601. The
 * typed events below narrow `eventType` and `data`.
 */
export const checkoutWebhookEnvelopeSchema = z.object({
  id: z.string(),
  eventType: z.string(),
  createdAt: z.iso.datetime(),
  data: z.unknown(),
});

export type CheckoutWebhookEnvelope = z.infer<
  typeof checkoutWebhookEnvelopeSchema
>;

/** A session turned `PAID` and the sale was committed. */
export const checkoutSessionPaidEventSchema = z.object({
  id: z.string(),
  eventType: z.literal("checkout_session_paid"),
  createdAt: z.iso.datetime(),
  data: checkoutSessionWebhookDataSchema,
});

export type CheckoutSessionPaidEvent = z.infer<
  typeof checkoutSessionPaidEventSchema
>;

/** An `OPEN` session passed `expiresAt`, or a late bank rejection expired it. */
export const checkoutSessionExpiredEventSchema = z.object({
  id: z.string(),
  eventType: z.literal("checkout_session_expired"),
  createdAt: z.iso.datetime(),
  data: checkoutSessionWebhookDataSchema,
});

export type CheckoutSessionExpiredEvent = z.infer<
  typeof checkoutSessionExpiredEventSchema
>;

/** The merchant API or a storefront canceled an `OPEN` session. */
export const checkoutSessionCanceledEventSchema = z.object({
  id: z.string(),
  eventType: z.literal("checkout_session_canceled"),
  createdAt: z.iso.datetime(),
  data: checkoutSessionWebhookDataSchema,
});

export type CheckoutSessionCanceledEvent = z.infer<
  typeof checkoutSessionCanceledEventSchema
>;

export type KnownCheckoutWebhookEvent =
  | (CheckoutSessionPaidEvent & { known: true })
  | (CheckoutSessionExpiredEvent & { known: true })
  | (CheckoutSessionCanceledEvent & { known: true });

/**
 * An event type this SDK version does not know. It parses instead of throwing
 * so a merchant on an old SDK version does not hard-fail on a new event.
 */
export type UnknownCheckoutWebhookEvent = CheckoutWebhookEnvelope & {
  known: false;
};

export type CheckoutWebhookEvent =
  | KnownCheckoutWebhookEvent
  | UnknownCheckoutWebhookEvent;

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
 * The connected account an event happened in, on the webhooks a platform's
 * "Cuentas conectadas" endpoints receive. Absent on an account's own events.
 */
const connectedAccountSchema = z.string().optional();

/**
 * The envelope every UnoPago webhook shares. `createdAt` is ISO 8601. The
 * typed events below narrow `eventType` and `data`.
 */
export const checkoutWebhookEnvelopeSchema = z.object({
  id: z.string(),
  eventType: z.string(),
  account: connectedAccountSchema,
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
  account: connectedAccountSchema,
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
  account: connectedAccountSchema,
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
  account: connectedAccountSchema,
  createdAt: z.iso.datetime(),
  data: checkoutSessionWebhookDataSchema,
});

export type CheckoutSessionCanceledEvent = z.infer<
  typeof checkoutSessionCanceledEventSchema
>;

/**
 * A payout of what UnoPago collected for the account. Amounts are bolívares,
 * as decimal strings; `paymentIds` are the payments it covers, the ids
 * `payment_received` carries.
 */
export const settlementWebhookPayloadSchema = z.object({
  id: z.string(),
  status: z.enum(["COMPLETED", "FAILED", "CANCELED"]),
  currency: z.literal("VES"),
  totalAmount: z.string(),
  totalFees: z.string(),
  netAmount: z.string(),
  paymentCount: z.number().int(),
  paymentIds: z.array(z.string()),
  processingBank: z.string(),
  bankReference: z.string().nullable(),
  bankAccount: z
    .object({ bankCode: z.string(), accountNumberLast4: z.string() })
    .nullable(),
  processedAt: z.iso.datetime().nullable(),
});

export type SettlementWebhookPayload = z.infer<
  typeof settlementWebhookPayloadSchema
>;

const settlementWebhookDataSchema = z.object({
  settlement: settlementWebhookPayloadSchema,
});

/** UnoPago paid out to the account's bank account. */
export const settlementCompletedEventSchema = z.object({
  id: z.string(),
  eventType: z.literal("settlement_completed"),
  account: connectedAccountSchema,
  createdAt: z.iso.datetime(),
  data: settlementWebhookDataSchema,
});

export type SettlementCompletedEvent = z.infer<
  typeof settlementCompletedEventSchema
>;

/**
 * A payout could not be completed (the bank refused it, or UnoPago could not
 * confirm it); the money stays owed.
 */
export const settlementFailedEventSchema = z.object({
  id: z.string(),
  eventType: z.literal("settlement_failed"),
  account: connectedAccountSchema,
  createdAt: z.iso.datetime(),
  data: settlementWebhookDataSchema,
});

export type SettlementFailedEvent = z.infer<typeof settlementFailedEventSchema>;

/**
 * A payout UnoPago canceled before sending it (the bank refused it, or it was
 * held to review its payments): it will never be paid. `paymentIds` are paid
 * in a later payout once UnoPago clears them.
 */
export const settlementCanceledEventSchema = z.object({
  id: z.string(),
  eventType: z.literal("settlement_canceled"),
  account: connectedAccountSchema,
  createdAt: z.iso.datetime(),
  data: settlementWebhookDataSchema,
});

export type SettlementCanceledEvent = z.infer<
  typeof settlementCanceledEventSchema
>;

export type KnownCheckoutWebhookEvent =
  | (CheckoutSessionPaidEvent & { known: true })
  | (CheckoutSessionExpiredEvent & { known: true })
  | (CheckoutSessionCanceledEvent & { known: true })
  | (SettlementCompletedEvent & { known: true })
  | (SettlementFailedEvent & { known: true })
  | (SettlementCanceledEvent & { known: true });

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

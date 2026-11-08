import { z } from "zod";

/**
 * The session's status:
 *
 * - `OPEN` until the buyer pays.
 * - `PROCESSING` while a bank charge is confirmed: it becomes `PAID`, or goes
 *   back to `OPEN` (`EXPIRED` if past `expiresAt`) when the bank rejects it.
 * - `PAID`, `EXPIRED` and `CANCELED` are final.
 * - `FAILED` is reserved and not used today.
 */
export const checkoutSessionStatusSchema = z.enum([
  "OPEN",
  "PROCESSING",
  "PAID",
  "FAILED",
  "EXPIRED",
  "CANCELED",
]);

export type CheckoutSessionStatus = z.infer<typeof checkoutSessionStatusSchema>;

/** The currencies a session can be created in. */
export const checkoutCurrencySchema = z.enum(["VES", "USD", "EUR"]);

export type CheckoutCurrency = z.infer<typeof checkoutCurrencySchema>;

/** A JSON value, as `metadata` accepts it. */
export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

/**
 * The IVA the merchant computed for a whole line, sent only by a session with
 * `automaticTax.enabled: false`. `amount` is what is charged; `rate` labels it
 * and groups it, and is not checked against the amount.
 *
 * `rate` has at most 4 decimal places, `amount` at most 2; the server refuses
 * anything finer with a 400.
 */
export const checkoutItemTaxSchema = z.object({
  type: z.literal("IVA"),
  /** The rate, `0 < rate < 1`, at most 4 decimal places. */
  rate: z.number().gt(0).lt(1).multipleOf(0.0001),
  /** The amount, at most 2 decimal places. */
  amount: z.number().min(0).max(1_000_000_000).multipleOf(0.01),
});

export type CheckoutItemTax = z.infer<typeof checkoutItemTaxSchema>;

/** One line as the session froze it. */
export const checkoutSessionItemSchema = z.object({
  /** The catalogue product the line was created from, if any. */
  productId: z.string().nullable(),
  description: z.string(),
  quantity: z.number().int(),
  /** The net unit price, in `currency`. */
  amount: z.number(),
  /** Whether the line is exempt from IVA. */
  exento: z.boolean(),
  /**
   * The IVA you sent for the line, as you sent it, when
   * `automaticTax.enabled` is `false`. Always empty when UnoPago computes it.
   */
  taxes: z.array(checkoutItemTaxSchema),
});

export type CheckoutSessionItem = z.infer<typeof checkoutSessionItemSchema>;

/**
 * The session fields both the REST endpoints and the `checkout_session_*`
 * webhook payloads carry. Dates are ISO 8601 strings on the wire; amounts are
 * decimal numbers in the currency's main unit (`25.5` is 25.50).
 */
export type CheckoutSessionBase = {
  /** The session id. */
  id: string;
  /** Your id for this session, when one was sent. */
  externalId: string | null;
  /** The session's status. See {@link CheckoutSessionStatus}. */
  status: CheckoutSessionStatus;
  /**
   * Whether UnoPago computed the IVA from your account's settings. `false`
   * when the session was created with your own IVA per line: see
   * `items[].taxes`.
   */
  automaticTax: { enabled: boolean };
  /**
   * What is sold. A product line carries its product's price and `exento`, and
   * follows them while the session is `OPEN`: the checkout page re-prices it
   * when it loads. Without `automaticTax`, a line without `taxes` is
   * `exento: true`.
   */
  items: CheckoutSessionItem[];
  /** The items' net total, before IVA. */
  subtotal: number;
  /**
   * The account's IVA rate when the session was created, applied to the
   * non-`exento` items. `null` when the account applies none. Without
   * `automaticTax`, the rate your lines' `taxes` share, or `null` when no line
   * has any or they use more than one: `ivaBreakdown` lists them.
   */
  ivaRate: number | null;
  /**
   * The IVA the buyer pays: `ivaRate` on the non-`exento` items, or without
   * `automaticTax`, the sum of your lines' `taxes[].amount`, never recomputed.
   */
  ivaAmount: number;
  /**
   * `ivaAmount` per rate, each with its taxable base, highest rate first.
   * Empty when no IVA applies.
   */
  ivaBreakdown: { rate: number; rateBase: number; amount: number }[];
  /** What the buyer pays, in `currency`: `subtotal + ivaAmount`. */
  amount: number;
  /** The session's currency. */
  currency: CheckoutCurrency;
  /**
   * What the buyer pays in bolívares: `amount` times `exchangeRate`, the rate
   * fixed when the session is created. Equal to `amount` for `VES`.
   */
  amountVes: number;
  /** Bolívares per unit of `currency`. `null` for `VES`. */
  exchangeRate: number | null;
  /** The BCV rate's date, ISO 8601. `null` for `VES`. */
  exchangeRateDate: string | null;
  /** A reference shown to the buyer, when one was sent. */
  reference: string | null;
  /** A description shown to the buyer, when one was sent. */
  description: string | null;
  /** The buyer's name, when one was sent. */
  buyerName: string | null;
  /** The buyer's email, when one was sent. */
  buyerEmail: string | null;
  /** When the buyer paid, ISO 8601. `null` until the session is `PAID`. */
  paidAt: string | null;
  /** When the session expires and can no longer be paid, ISO 8601. */
  expiresAt: string;
  /** Creation time, ISO 8601. */
  createdAt: string;
  /** Last update time, ISO 8601. */
  updatedAt: string;
};

export const checkoutSessionBaseSchema = z.object({
  id: z.string(),
  externalId: z.string().nullable(),
  status: checkoutSessionStatusSchema,
  automaticTax: z.object({ enabled: z.boolean() }),
  items: z.array(checkoutSessionItemSchema),
  subtotal: z.number(),
  ivaRate: z.number().nullable(),
  ivaAmount: z.number(),
  ivaBreakdown: z.array(
    z.object({
      rate: z.number(),
      rateBase: z.number(),
      amount: z.number(),
    }),
  ),
  amount: z.number(),
  currency: checkoutCurrencySchema,
  amountVes: z.number(),
  exchangeRate: z.number().nullable(),
  exchangeRateDate: z.iso.datetime().nullable(),
  reference: z.string().nullable(),
  description: z.string().nullable(),
  buyerName: z.string().nullable(),
  buyerEmail: z.string().nullable(),
  paidAt: z.iso.datetime().nullable(),
  expiresAt: z.iso.datetime(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
}) satisfies z.ZodType<CheckoutSessionBase>;

/**
 * The session as the REST endpoints return it: the common fields plus the two
 * token-derived URLs.
 */
export type CheckoutSession = CheckoutSessionBase & {
  /**
   * The hosted checkout page. Send the buyer here, or use `iframeUrl` to embed
   * the form on your site.
   */
  url: string;
  /**
   * A form-only version of the checkout, for an `<iframe>` on one of the
   * origins sent in `iframeAllowedOrigins`. `null` when the session has no
   * allowlist. The URL is signed: don't change it.
   */
  iframeUrl: string | null;
};

export const checkoutSessionSchema = checkoutSessionBaseSchema.extend({
  url: z.url(),
  iframeUrl: z.url().nullable(),
}) satisfies z.ZodType<CheckoutSession>;

/** One line a `create` call sends. The server prices it; the total is never an input. */
export type CheckoutSessionItemInput = {
  /**
   * The line's description. Required when the line has no `productId`; a line
   * with one takes the product's description when this is left out.
   */
  description?: string;
  /** A catalogue product. Its price and `exento` are taken when left out. */
  productId?: string;
  /** How many units. */
  quantity: number;
  /**
   * The net unit price, in `currency`. Required when the line has no
   * `productId`.
   */
  amount?: number;
  /**
   * Whether the line is exempt from IVA. Only accepted with `automaticTax`
   * left out or enabled.
   */
  exento?: boolean;
  /**
   * The IVA you computed for the line, for a session with
   * `automaticTax.enabled: false`. At most one entry.
   */
  taxes?: CheckoutItemTax[];
};

/** The body of `checkoutSessions.create`. */
export type CheckoutSessionCreateInput = {
  /**
   * Your id for this session. Sending the same `externalId` again returns the
   * existing session instead of creating another; with different items
   * (`taxes` included), `automaticTax`, currency or iframe origins it is
   * refused with `409 CONFLICT`.
   */
  externalId?: string;
  /**
   * A `USD` or `EUR` total is converted to bolívares at the day's BCV rate;
   * the buyer always pays in bolívares.
   */
  currency: CheckoutCurrency;
  /**
   * Who computes the IVA. Left out or `true`: UnoPago adds your account's IVA
   * to the non-`exento` lines. `false`: you send each line's IVA in
   * `items[].taxes`, and the order can't be fiscally printed or emitted.
   */
  automaticTax?: { enabled: boolean };
  /** What is sold. */
  items: CheckoutSessionItemInput[];
  /** Shown to the buyer on the checkout page. */
  reference?: string;
  /** Shown to the buyer on the checkout page. */
  description?: string;
  /** Prefills the payment form. */
  buyerName?: string;
  /** Prefills the payment form. */
  buyerEmail?: string;
  /** Your own data, stored with the session. */
  metadata?: Record<string, JsonValue>;
  /** Where the buyer is sent after paying. */
  successUrl?: string;
  /** The checkout page's way back whenever the session isn't `PAID`. */
  cancelUrl?: string;
  /**
   * The origins allowed to frame `iframeUrl`, e.g. `https://shop.example.com`.
   * Exact origins only (scheme + host + optional port), at most 10. Send it and
   * the response carries a signed `iframeUrl`.
   */
  iframeAllowedOrigins?: string[];
  /**
   * Minutes until the session expires. An integer from 5 to 1,440; defaults to
   * 30.
   */
  expiresInMinutes?: number;
};

/** The query of `checkoutSessions.list`. */
export type CheckoutSessionListInput = {
  /** Only sessions in this status. */
  status?: CheckoutSessionStatus;
  /** The page, from 1. Defaults to 1. */
  page?: number;
  /** The page size. Defaults to 25, at most 100. */
  pageSize?: number;
};

/** One page of sessions. */
export type CheckoutSessionList = {
  results: CheckoutSession[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

export const checkoutSessionListSchema = z.object({
  results: z.array(checkoutSessionSchema),
  total: z.number().int(),
  page: z.number().int(),
  pageSize: z.number().int(),
  totalPages: z.number().int(),
}) satisfies z.ZodType<CheckoutSessionList>;

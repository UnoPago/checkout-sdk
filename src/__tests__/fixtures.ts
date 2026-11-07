import type {
  CheckoutSession,
  CheckoutSessionBase,
  CheckoutSessionList,
} from "../types";
import type { CheckoutSessionWebhookPayload } from "../webhookTypes";

export const CHECKOUT_SESSION_ID = "cm9x2k4q80001s6v1h3d7e2ab";

/** The common fields, with every date as the ISO string the wire carries. */
export const checkoutSessionBaseFixture: CheckoutSessionBase = {
  id: CHECKOUT_SESSION_ID,
  externalId: "ORD-10293",
  status: "OPEN",
  automaticTax: { enabled: false },
  items: [
    {
      productId: null,
      description: "Tuition",
      quantity: 1,
      amount: 25,
      exento: false,
      taxes: [{ type: "IVA", rate: 0.16, amount: 4 }],
    },
  ],
  subtotal: 25,
  ivaRate: 0.16,
  ivaAmount: 4,
  ivaBreakdown: [{ rate: 0.16, rateBase: 25, amount: 4 }],
  amount: 29,
  currency: "USD",
  amountVes: 5234.5,
  exchangeRate: 180.5,
  exchangeRateDate: "2026-11-01T00:00:00.000Z",
  reference: "Order 10293",
  description: "October tuition",
  buyerName: "María Pérez",
  buyerEmail: "maria@example.com",
  paidAt: null,
  expiresAt: "2026-11-06T12:30:00.000Z",
  createdAt: "2026-11-06T12:00:00.000Z",
  updatedAt: "2026-11-06T12:00:00.000Z",
};

export const checkoutSessionFixture: CheckoutSession = {
  ...checkoutSessionBaseFixture,
  url: "https://checkout.unopago.com/pay/6Xo1token",
  iframeUrl:
    "https://checkout.unopago.com/embed/pay/6Xo1token?payload=eyJ2IjoxfQ&sig=abc",
};

export const checkoutSessionWebhookPayloadFixture: CheckoutSessionWebhookPayload =
  {
    ...checkoutSessionBaseFixture,
    provider: "API",
    invoiceId: null,
    paymentId: null,
    test: false,
  };

export const checkoutSessionListFixture: CheckoutSessionList = {
  results: [checkoutSessionFixture],
  total: 1,
  page: 1,
  pageSize: 25,
  totalPages: 1,
};

/** The wire envelope for a `checkout_session_*` delivery. */
export function checkoutWebhookEventFixture(
  eventType: string,
  data: unknown,
): {
  id: string;
  eventType: string;
  createdAt: string;
  data: unknown;
} {
  return {
    id: "evt_01J8Z3K4M5N6P7Q8R9S0T1U2V3",
    eventType,
    createdAt: "2026-11-06T12:00:00.000Z",
    data,
  };
}

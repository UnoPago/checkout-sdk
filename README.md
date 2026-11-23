# @unopago/checkout-sdk

A typed client for UnoPago Checkout: the four `/v1/checkout-sessions` REST
endpoints, the embeddable iframe, and the `checkout_session_*` webhook
signature.

The package has three independent entry points, so a runtime only pulls in
what it needs:

| Entry point                      | Runtime       | Wraps                                                       |
| -------------------------------- | ------------- | ----------------------------------------------------------- |
| `@unopago/checkout-sdk`          | Node (server) | `POST/GET /v1/checkout-sessions`, `GET` list, `POST` cancel |
| `@unopago/checkout-sdk/embed`    | Browser       | Mounting the iframe and the typed `postMessage` events      |
| `@unopago/checkout-sdk/webhooks` | Node (server) | `checkout_session_*` signature verification and payloads    |

> **Status:** this package is not published to a registry yet. Until it is,
> build it from source (see [Development](#development)).

## REST client

```ts
import { CheckoutClient } from "@unopago/checkout-sdk";

const apiKey = process.env.UNOPAGO_API_KEY;
if (!apiKey) throw new Error("UNOPAGO_API_KEY is not set");

const checkout = new CheckoutClient({ apiKey });

const session = await checkout.checkoutSessions.create({
  currency: "USD",
  items: [{ description: "Tuition", quantity: 1, amount: 25 }],
  externalId: "ORD-10293",
});

await checkout.checkoutSessions.get(session.id);
await checkout.checkoutSessions.list({ status: "PAID", page: 1 });
await checkout.checkoutSessions.cancel(session.id);
```

To pay vendors a part of the order, send `splits` (each an `amount` in the
session's `currency` for one of your vendors' ids; up to 10, each vendor once):

```ts
await checkout.checkoutSessions.create({
  currency: "USD",
  items: [{ description: "Combo 3", quantity: 1, amount: 12 }],
  splits: [{ vendor: "cm9x2k4q80001s6v1h3d7e2ab", amount: 9 }],
});
```

UnoPago pays each vendor its part and you keep the rest, paying UnoPago's fee
on the whole charge. A session with `splits` is paid by C2P or immediate debit
only, in one payment. Every session carries its `splits` back (empty when it
has none), each with the vendor's `externalId` and, once the session is `PAID`,
its `amountVes`: the bolívares UnoPago pays that vendor.

`CheckoutClientOptions`:

- `apiKey` (required): an API key from the console, under **Configuración →
  Claves API**.
- `baseUrl`: defaults to `https://api.unopago.com`; override it for staging or
  local development.
- `fetch`: defaults to the global `fetch`; inject one for tests or a custom
  runtime.

Responses are parsed with the SDK's own schemas, so a field the API removes or
retypes surfaces as a `ZodError` at the call site. A field the API adds is
stripped rather than exposed, so it does not reach the caller until the SDK's
types cover it.

### Errors

A non-2xx answer throws `CheckoutApiError`:

```ts
import { CheckoutApiError } from "@unopago/checkout-sdk";

try {
  await checkout.checkoutSessions.cancel(session.id);
} catch (error) {
  if (error instanceof CheckoutApiError) {
    error.status; // 409
    error.code; // "CONFLICT"
    error.message; // the API's Spanish copy
    error.errorCode; // "CHARGE_REJECTED", when the API sent data.errorCode
    error.issues?.[0]?.message; // field-level copy on a validation error
  }
}
```

`message` is the Spanish copy meant for the end user when the refusal is a
business rule; on a validation error it is the first `issues[].message`. A
network failure — no response at all — throws the underlying `fetch` error
unwrapped. The SDK does not retry, including on `429` or `5xx`: that is the
caller's decision.

## Embed helper

```ts
import { mountCheckoutEmbed } from "@unopago/checkout-sdk/embed";

const container = document.getElementById("checkout");
if (!container) throw new Error("missing #checkout");
if (!session.iframeUrl) {
  throw new Error("create the session with iframeAllowedOrigins");
}

const embed = mountCheckoutEmbed(container, {
  iframeUrl: session.iframeUrl, // from checkoutSessions.create(), server-side
  onReady: () => {},
  onSuccess: () => {
    // UX only — confirm server-side via the paid webhook or GET before fulfilling
  },
});

// later
embed.unmount();
```

The helper:

1. Creates the `<iframe>` with `referrerpolicy="no-referrer"`, a sandbox that
   allows forms, scripts and the checkout's own origin, `width: 100%` and no
   border.
2. Attaches one `message` listener **before** the URL loads and trusts a message
   only when its `origin` is the iframe's origin, its `source` is the iframe
   itself, and it carries `source: "unopago-checkout"`.
3. Applies `resize` messages to the iframe's height automatically; `onResize`
   is there for callers with their own layout needs.
4. `unmount()` removes both the listener and the element, so an embed does not
   leak a listener.

The signed `iframeUrl` lives only in the helper's closure and in the iframe's
`src`. It is not removed from `src` — the checkout app has no database and
needs the signed payload there — so keep session TTLs short and don't log the
URL. `success` is a UI signal, never proof of payment.

## Webhook verification

```ts
import { verifyCheckoutWebhookSignature } from "@unopago/checkout-sdk/webhooks";

const secret = process.env.UNOPAGO_WEBHOOK_SECRET;
if (!secret) throw new Error("UNOPAGO_WEBHOOK_SECRET is not set");

app.post("/webhooks/unopago", express.raw({ type: "*/*" }), (req, res) => {
  let event: ReturnType<typeof verifyCheckoutWebhookSignature>;
  try {
    event = verifyCheckoutWebhookSignature({
      payload: req.body, // Buffer | string — the RAW body, before JSON.parse
      header: req.header("Webhook-Signature") ?? "",
      secret,
    });
  } catch {
    // InvalidWebhookSignatureError, SyntaxError or ZodError: reject the POST.
    return res.sendStatus(400);
  }

  if (!event.known) {
    // A future event type: acknowledge it and ignore it.
    return res.sendStatus(200);
  }

  switch (event.eventType) {
    case "checkout_session_partially_paid":
      // a part was paid; the rest is still owed: event.data.checkoutSession
      // .amountPaid, .amountRemaining (in its currency), .paymentIds
      break;
    case "checkout_session_paid":
      // event.data.checkoutSession.externalId, .invoiceId, .paymentIds, ...
      // event.account: the connected account it happened in, when a
      // platform's "Cuentas conectadas" endpoint receives it; else undefined.
      break;
    case "checkout_session_expired":
    case "checkout_session_canceled":
      break;
    case "settlement_completed":
      // event.data.settlement.netAmount, .paymentIds: UnoPago paid the account
      // .vendor: set ({ id, externalId }) when it paid one of your vendors
      // instead; .totalSplits: what of your own payout's payments was theirs.
      // If you split orders, check .vendor before counting netAmount as
      // yours (this field needs version 1.5.0 or later).
      break;
    case "settlement_failed":
      // the payout could not be completed (the bank refused it, or UnoPago
      // could not confirm it); the money stays owed
      break;
    case "settlement_canceled":
      // never paid: event.data.settlement.paymentIds move to a later payout
      break;
  }

  res.sendStatus(200);
});
```

The verifier:

- Parses `t=...,v1=...`, recomputes `HMAC-SHA256(secret, "<t>.<rawBody>")` in
  hex, compares with `timingSafeEqual`, and rejects a `t` more than
  `toleranceSeconds` (default 300) away from now, past or future, to block
  replay.
- Returns a parsed, typed event, not just a boolean. An event type this SDK
  version does not know comes back with `known: false` and `data: unknown`
  instead of throwing, so an old SDK version survives a new event.
- Throws `InvalidWebhookSignatureError` on a bad signature, a malformed header
  or a stale or future timestamp, a `SyntaxError` when the body is not JSON,
  and a `ZodError` when it does not match the documented envelope.

Fulfil on the event type, never on which fields are set:
`checkout_session_paid` is the fulfilment signal. A session can be paid in
parts: each checkout payment that leaves part to pay sends
`checkout_session_partially_paid`, and the payment that closes the session
sends `checkout_session_paid`. A payment you record into its invoice from the
panel sends no checkout event of its own, but it counts in `amountPaid` and
`paymentIds`, and if it closes the invoice the session turns `PAID`. All four events carry the full session in the same
shape: your `externalId`, `amountPaid` and `amountRemaining` (in the session's
currency), and `paymentIds`, every payment applied to it, oldest first. A
canceled session that was paid in part keeps its `amountPaid` and
`paymentIds`: that money stays as your customer's credit. `paymentId` is deprecated and will be
removed: use `paymentIds`. The session is read when the event is sent, so
re-read it before acting if ordering matters; webhooks are notifications, not
state.

## Development

```bash
pnpm install
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

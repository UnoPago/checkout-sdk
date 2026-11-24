# @unopago/checkout-sdk

## 1.0.0

First public release.

- `@unopago/checkout-sdk`: `CheckoutClient` creates, reads, lists and cancels
  checkout sessions, with `splits` to pay vendors a part of an order, and
  throws `CheckoutApiError` on a non-2xx answer. The zod schemas it parses
  responses with are exported too.
- `@unopago/checkout-sdk/embed`: `mountCheckoutEmbed` mounts the checkout
  iframe and delivers its typed `ready`, `success` and `resize` messages.
- `@unopago/checkout-sdk/webhooks`: `verifyCheckoutWebhookSignature` checks a
  webhook's signature and timestamp and returns the typed event: the four
  `checkout_session_*` events and the three `settlement_*` events. An event
  type this version does not know comes back with `known: false` instead of
  throwing.

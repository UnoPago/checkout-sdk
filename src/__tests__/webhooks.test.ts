import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  InvalidWebhookSignatureError,
  verifyCheckoutWebhookSignature,
} from "../webhooks";
import {
  checkoutSessionWebhookPayloadFixture,
  checkoutWebhookEventFixture,
} from "./fixtures";

const SECRET = "whsec_test";
const NOW_SECONDS = 1_761_235_200;

function signWith(
  secret: string,
  payload: string | Buffer,
  timestamp = NOW_SECONDS,
): string {
  const signature = createHmac("sha256", secret)
    .update(`${timestamp}.`)
    .update(payload)
    .digest("hex");
  return `t=${timestamp},v1=${signature}`;
}

function sign(payload: string | Buffer, timestamp = NOW_SECONDS): string {
  return signWith(SECRET, payload, timestamp);
}

function eventBody(eventType = "checkout_session_paid"): string {
  return JSON.stringify(
    checkoutWebhookEventFixture(eventType, {
      checkoutSession: checkoutSessionWebhookPayloadFixture,
    }),
  );
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW_SECONDS * 1000);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("verifyCheckoutWebhookSignature", () => {
  test("returns the parsed, typed paid event", () => {
    const payload = eventBody("checkout_session_paid");

    const event = verifyCheckoutWebhookSignature({
      payload,
      header: sign(payload),
      secret: SECRET,
    });

    expect(event.known).toBe(true);
    if (!event.known) throw new Error("expected a known event");
    expect(event.eventType).toBe("checkout_session_paid");
    if (event.eventType !== "checkout_session_paid") {
      throw new Error("expected a paid event");
    }
    expect(event.createdAt).toBe("2026-11-06T12:00:00.000Z");
    expect(event.data.checkoutSession.externalId).toBe("ORD-10293");
    expect(event.data.checkoutSession.provider).toBe("API");
    expect(event.data.checkoutSession.test).toBe(false);
    expect(event.data.checkoutSession.invoiceId).toBeNull();
  });

  test("keeps the connected account a platform's event names", () => {
    for (const eventType of [
      "checkout_session_paid",
      "checkout_session_expired",
      "checkout_session_canceled",
      "invoice_created",
    ]) {
      const payload = JSON.stringify({
        ...checkoutWebhookEventFixture(eventType, {
          checkoutSession: checkoutSessionWebhookPayloadFixture,
        }),
        account: "acc_r42",
      });

      const event = verifyCheckoutWebhookSignature({
        payload,
        header: sign(payload),
        secret: SECRET,
      });

      expect(event.account).toBe("acc_r42");
    }
  });

  test("leaves account undefined on an account's own event", () => {
    const payload = eventBody("checkout_session_paid");

    const event = verifyCheckoutWebhookSignature({
      payload,
      header: sign(payload),
      secret: SECRET,
    });

    expect(event.account).toBeUndefined();
  });

  test("parses a connected account's settlement events", () => {
    const settlement = {
      id: "set_7f3",
      status: "COMPLETED",
      currency: "VES",
      totalAmount: "480.00",
      totalFees: "4.80",
      netAmount: "475.20",
      paymentCount: 1,
      paymentIds: ["cm0000000000000000000pa01"],
      processingBank: "BNC",
      bankReference: "00123456",
      bankAccount: { bankCode: "0134", accountNumberLast4: "4421" },
      processedAt: "2026-11-12T20:00:00.000Z",
    };
    for (const [eventType, data] of [
      ["settlement_completed", { settlement }],
      [
        "settlement_failed",
        {
          settlement: {
            ...settlement,
            status: "FAILED",
            bankReference: null,
            processedAt: null,
          },
        },
      ],
      [
        "settlement_canceled",
        {
          settlement: {
            ...settlement,
            status: "CANCELED",
            bankReference: null,
            processedAt: null,
          },
        },
      ],
    ] as const) {
      const payload = JSON.stringify({
        ...checkoutWebhookEventFixture(eventType, data),
        account: "acc_r42",
      });

      const event = verifyCheckoutWebhookSignature({
        payload,
        header: sign(payload),
        secret: SECRET,
      });

      if (!event.known) throw new Error("expected a known event");
      expect(event.account).toBe("acc_r42");
      if (event.eventType === "settlement_completed") {
        expect(event.data.settlement.netAmount).toBe("475.20");
        expect(event.data.settlement.paymentIds).toEqual([
          "cm0000000000000000000pa01",
        ]);
      } else if (event.eventType === "settlement_failed") {
        expect(event.data.settlement.status).toBe("FAILED");
      } else if (event.eventType === "settlement_canceled") {
        expect(event.data.settlement.status).toBe("CANCELED");
        expect(event.data.settlement.paymentIds).toEqual([
          "cm0000000000000000000pa01",
        ]);
      } else {
        throw new Error(`unexpected event ${event.eventType}`);
      }
    }
  });

  test("accepts the raw body as a Buffer", () => {
    const payload = eventBody("checkout_session_paid");

    const event = verifyCheckoutWebhookSignature({
      payload: Buffer.from(payload, "utf8"),
      header: sign(payload),
      secret: SECRET,
    });

    expect(event.known).toBe(true);
    expect(event.eventType).toBe("checkout_session_paid");
  });

  test("parses each known checkout event type", () => {
    for (const eventType of [
      "checkout_session_paid",
      "checkout_session_expired",
      "checkout_session_canceled",
    ]) {
      const payload = eventBody(eventType);

      const event = verifyCheckoutWebhookSignature({
        payload,
        header: sign(payload),
        secret: SECRET,
      });

      expect(event.known).toBe(true);
      expect(event.eventType).toBe(eventType);
    }
  });

  test("rejects an empty or whitespace-only secret", () => {
    const payload = eventBody();
    const header = sign(payload);

    for (const secret of ["", "   "]) {
      expect(() =>
        verifyCheckoutWebhookSignature({ payload, header, secret }),
      ).toThrow(InvalidWebhookSignatureError);
    }
  });

  test("rejects a bad signature", () => {
    const payload = eventBody();

    expect(() =>
      verifyCheckoutWebhookSignature({
        payload,
        header: signWith("whsec_other", payload),
        secret: SECRET,
      }),
    ).toThrow(InvalidWebhookSignatureError);
  });

  test("rejects a payload that changed after signing", () => {
    const payload = eventBody();
    const header = sign(payload);
    const tampered = payload.replace("ORD-10293", "ORD-99999");

    expect(() =>
      verifyCheckoutWebhookSignature({
        payload: tampered,
        header,
        secret: SECRET,
      }),
    ).toThrow(InvalidWebhookSignatureError);
  });

  test("rejects malformed headers", () => {
    const payload = eventBody();
    const validSignature = "0".repeat(64);

    for (const header of [
      "",
      "v1=abc",
      `t=123`,
      `t=abc,v1=${validSignature}`,
      `t=${NOW_SECONDS},v1=not-hex`,
      `t=${NOW_SECONDS},v1=abc`,
    ]) {
      expect(() =>
        verifyCheckoutWebhookSignature({ payload, header, secret: SECRET }),
      ).toThrow(InvalidWebhookSignatureError);
    }
  });

  test("rejects a timestamp older than the default tolerance", () => {
    const payload = eventBody();

    expect(() =>
      verifyCheckoutWebhookSignature({
        payload,
        header: sign(payload, NOW_SECONDS - 301),
        secret: SECRET,
      }),
    ).toThrow(InvalidWebhookSignatureError);

    expect(() =>
      verifyCheckoutWebhookSignature({
        payload,
        header: sign(payload, NOW_SECONDS - 299),
        secret: SECRET,
      }),
    ).not.toThrow();
  });

  test("rejects a timestamp more than the tolerance in the future", () => {
    const payload = eventBody();

    expect(() =>
      verifyCheckoutWebhookSignature({
        payload,
        header: sign(payload, NOW_SECONDS + 301),
        secret: SECRET,
      }),
    ).toThrow(InvalidWebhookSignatureError);

    expect(() =>
      verifyCheckoutWebhookSignature({
        payload,
        header: sign(payload, NOW_SECONDS + 299),
        secret: SECRET,
      }),
    ).not.toThrow();
  });

  test("honors a custom tolerance", () => {
    const payload = eventBody();

    expect(() =>
      verifyCheckoutWebhookSignature({
        payload,
        header: sign(payload, NOW_SECONDS - 10),
        secret: SECRET,
        toleranceSeconds: 5,
      }),
    ).toThrow(InvalidWebhookSignatureError);

    expect(() =>
      verifyCheckoutWebhookSignature({
        payload,
        header: sign(payload, NOW_SECONDS - 10),
        secret: SECRET,
        toleranceSeconds: 20,
      }),
    ).not.toThrow();
  });

  test("returns an unknown event type instead of throwing", () => {
    const payload = JSON.stringify(
      checkoutWebhookEventFixture("invoice_future_event", { hello: "world" }),
    );

    const event = verifyCheckoutWebhookSignature({
      payload,
      header: sign(payload),
      secret: SECRET,
    });

    expect(event.known).toBe(false);
    if (event.known) throw new Error("expected an unknown event");
    expect(event.eventType).toBe("invoice_future_event");
    expect(event.data).toEqual({ hello: "world" });
  });

  test("throws on a body that is not JSON", () => {
    const payload = "not json";

    expect(() =>
      verifyCheckoutWebhookSignature({
        payload,
        header: sign(payload),
        secret: SECRET,
      }),
    ).toThrow();
  });

  test("throws on a JSON body that is not an envelope", () => {
    const payload = JSON.stringify({
      id: "evt_1",
      createdAt: "2026-11-06T12:00:00.000Z",
      data: {},
    });

    expect(() =>
      verifyCheckoutWebhookSignature({
        payload,
        header: sign(payload),
        secret: SECRET,
      }),
    ).toThrow();
  });

  test("throws on a known event type whose payload does not match", () => {
    const payload = JSON.stringify(
      checkoutWebhookEventFixture("checkout_session_paid", {}),
    );

    expect(() =>
      verifyCheckoutWebhookSignature({
        payload,
        header: sign(payload),
        secret: SECRET,
      }),
    ).toThrow();
  });

  test("tolerates whitespace in the header", () => {
    const payload = eventBody();
    const header = sign(payload).replace(",", ", ");

    expect(() =>
      verifyCheckoutWebhookSignature({ payload, header, secret: SECRET }),
    ).not.toThrow();
  });
});

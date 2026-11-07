import { describe, expect, test } from "vitest";
import { CheckoutClient, type CheckoutFetch } from "../client";
import { CheckoutApiError } from "../errors";
import type { CheckoutSessionCreateInput } from "../types";
import {
  CHECKOUT_SESSION_ID,
  checkoutSessionFixture,
  checkoutSessionListFixture,
} from "./fixtures";

type FetchCall = { url: string; init: RequestInit };

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function textResponse(body: string, status: number): Response {
  return new Response(body, { status });
}

function recordingFetch(respond: () => Response | Promise<Response>): {
  fetch: CheckoutFetch;
  calls: FetchCall[];
} {
  const calls: FetchCall[] = [];
  return {
    calls,
    fetch: async (url, init) => {
      calls.push({ url, init });
      return respond();
    },
  };
}

function singleCall(calls: FetchCall[]): FetchCall {
  expect(calls).toHaveLength(1);
  const call = calls[0];
  if (!call) throw new Error("expected one fetch call");
  return call;
}

function header(init: RequestInit, name: string): string | null {
  return new Headers(init.headers).get(name);
}

describe("CheckoutClient", () => {
  const createInput: CheckoutSessionCreateInput = {
    currency: "USD",
    items: [{ description: "Tuition", quantity: 1, amount: 25 }],
    externalId: "ORD-10293",
  };

  test("create POSTs the body and parses the session", async () => {
    const { fetch, calls } = recordingFetch(() =>
      jsonResponse(checkoutSessionFixture),
    );
    const client = new CheckoutClient({ apiKey: "sk_test", fetch });

    const session = await client.checkoutSessions.create(createInput);

    expect(session).toEqual(checkoutSessionFixture);
    const call = singleCall(calls);
    expect(call.url).toBe("https://api.unopago.com/v1/checkout-sessions");
    expect(call.init.method).toBe("POST");
    expect(header(call.init, "authorization")).toBe("Bearer sk_test");
    expect(header(call.init, "accept")).toBe("application/json");
    expect(header(call.init, "content-type")).toBe("application/json");
    const body = call.init.body;
    if (typeof body !== "string") {
      throw new Error("expected the body to be a JSON string");
    }
    expect(JSON.parse(body)).toEqual(createInput);
  });

  test("get sends the id in the path and no body", async () => {
    const { fetch, calls } = recordingFetch(() =>
      jsonResponse(checkoutSessionFixture),
    );
    const client = new CheckoutClient({
      apiKey: "sk_test",
      baseUrl: "https://api.example.com/",
      fetch,
    });

    await client.checkoutSessions.get(CHECKOUT_SESSION_ID);

    const call = singleCall(calls);
    expect(call.url).toBe(
      `https://api.example.com/v1/checkout-sessions/${CHECKOUT_SESSION_ID}`,
    );
    expect(call.init.method).toBe("GET");
    expect(call.init.body).toBeUndefined();
    expect(header(call.init, "content-type")).toBeNull();
  });

  test("list sends only the filters that were given", async () => {
    const { fetch, calls } = recordingFetch(() =>
      jsonResponse(checkoutSessionListFixture),
    );
    const client = new CheckoutClient({ apiKey: "sk_test", fetch });

    await client.checkoutSessions.list({
      status: "PAID",
      page: 2,
      pageSize: 50,
    });

    const call = singleCall(calls);
    expect(call.url).toBe(
      "https://api.unopago.com/v1/checkout-sessions?status=PAID&page=2&pageSize=50",
    );
    expect(call.init.method).toBe("GET");
  });

  test("list without filters sends no query string", async () => {
    const { fetch, calls } = recordingFetch(() =>
      jsonResponse(checkoutSessionListFixture),
    );
    const client = new CheckoutClient({ apiKey: "sk_test", fetch });

    await client.checkoutSessions.list();

    expect(singleCall(calls).url).toBe(
      "https://api.unopago.com/v1/checkout-sessions",
    );
  });

  test("cancel POSTs to the cancel path with no body", async () => {
    const { fetch, calls } = recordingFetch(() =>
      jsonResponse(checkoutSessionFixture),
    );
    const client = new CheckoutClient({ apiKey: "sk_test", fetch });

    await client.checkoutSessions.cancel(CHECKOUT_SESSION_ID);

    const call = singleCall(calls);
    expect(call.url).toBe(
      `https://api.unopago.com/v1/checkout-sessions/${CHECKOUT_SESSION_ID}/cancel`,
    );
    expect(call.init.method).toBe("POST");
    expect(call.init.body).toBeUndefined();
    expect(header(call.init, "content-type")).toBeNull();
  });

  test("maps the REST error envelope into CheckoutApiError", async () => {
    const body = {
      message: "La sesión ya no se puede cancelar.",
      code: "CONFLICT",
      data: { code: "CONFLICT", httpStatus: 409, errorCode: "CHARGE_REJECTED" },
    };
    const { fetch } = recordingFetch(() => jsonResponse(body, 409));
    const client = new CheckoutClient({ apiKey: "sk_test", fetch });

    const error = await client.checkoutSessions
      .cancel(CHECKOUT_SESSION_ID)
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(CheckoutApiError);
    expect(error).toMatchObject({
      status: 409,
      code: "CONFLICT",
      errorCode: "CHARGE_REJECTED",
      message: "La sesión ya no se puede cancelar.",
      issues: null,
    });
  });

  test("a validation issue's message takes precedence over the envelope's", async () => {
    const body = {
      message: "La validación de los datos de entrada falló",
      code: "BAD_REQUEST",
      issues: [
        { message: "Teléfono inválido", path: ["phone"] },
        { message: "Monto inválido", path: ["amount"] },
      ],
    };
    const { fetch } = recordingFetch(() => jsonResponse(body, 400));
    const client = new CheckoutClient({ apiKey: "sk_test", fetch });

    const error = await client.checkoutSessions
      .create(createInput)
      .catch((caught: unknown) => caught);

    expect(error).toMatchObject({
      status: 400,
      code: "BAD_REQUEST",
      message: "Teléfono inválido",
      issues: body.issues,
    });
  });

  test("a non-JSON error body falls back to the status", async () => {
    const { fetch } = recordingFetch(() => textResponse("Bad gateway", 502));
    const client = new CheckoutClient({ apiKey: "sk_test", fetch });

    const error = await client.checkoutSessions
      .get(CHECKOUT_SESSION_ID)
      .catch((caught: unknown) => caught);

    expect(error).toMatchObject({
      status: 502,
      code: null,
      errorCode: null,
      message: "UnoPago API request failed with status 502",
      issues: null,
    });
  });

  test("a network failure is thrown unwrapped", async () => {
    const failure = new TypeError("fetch failed");
    const client = new CheckoutClient({
      apiKey: "sk_test",
      fetch: async () => {
        throw failure;
      },
    });

    await expect(client.checkoutSessions.get(CHECKOUT_SESSION_ID)).rejects.toBe(
      failure,
    );
  });
});

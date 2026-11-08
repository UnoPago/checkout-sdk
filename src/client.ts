import type { z } from "zod";
import { checkoutApiErrorFromResponse } from "./errors";
import { isLoopbackHost } from "./hosts";
import {
  checkoutSessionListSchema,
  checkoutSessionSchema,
  type CheckoutSession,
  type CheckoutSessionCreateInput,
  type CheckoutSessionList,
  type CheckoutSessionListInput,
} from "./types";

/** Where the public API lives. Override it for staging or local development. */
export const DEFAULT_CHECKOUT_API_BASE_URL = "https://api.unopago.com";

/**
 * The subset of `fetch` the client uses. Inject one for tests or for a runtime
 * whose global `fetch` is not the one you want.
 */
export type CheckoutFetch = (
  url: string,
  init: RequestInit,
) => Promise<Response>;

export type CheckoutClientOptions = {
  /** An API key from the console, under **Configuración → Claves API**. */
  apiKey: string;
  /** Defaults to {@link DEFAULT_CHECKOUT_API_BASE_URL}. */
  baseUrl?: string;
  /** Defaults to the global `fetch`. */
  fetch?: CheckoutFetch;
};

type CheckoutClientConfig = {
  apiKey: string;
  baseUrl: string;
  fetch: CheckoutFetch;
};

type RequestOptions = {
  method: "GET" | "POST";
  path: string;
  body?: unknown;
};

/** Throws for a base URL that would send the API key in clear. */
function assertSafeBaseUrl(baseUrl: string): void {
  let url: URL;
  try {
    url = new URL(baseUrl);
  } catch {
    throw new Error(`baseUrl must be an absolute URL, got ${baseUrl}`);
  }
  if (
    url.protocol !== "https:" &&
    !(url.protocol === "http:" && isLoopbackHost(url.hostname))
  ) {
    throw new Error(
      `baseUrl must use https (http is allowed only for loopback hosts), got ${url.protocol}`,
    );
  }
}

/** The four `/v1/checkout-sessions` endpoints. */
export class CheckoutClient {
  readonly checkoutSessions: CheckoutSessionsResource;

  constructor(options: CheckoutClientOptions) {
    const baseUrl = (options.baseUrl ?? DEFAULT_CHECKOUT_API_BASE_URL).replace(
      /\/+$/,
      "",
    );
    assertSafeBaseUrl(baseUrl);

    this.checkoutSessions = new CheckoutSessionsResource({
      apiKey: options.apiKey,
      baseUrl,
      fetch: options.fetch ?? fetch,
    });
  }
}

/** One JSON parse, with `undefined` for a body that is not JSON. */
function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

class CheckoutSessionsResource {
  constructor(private readonly config: CheckoutClientConfig) {}

  /**
   * Creates a session, or returns the existing one when `externalId` was sent
   * before.
   */
  create(input: CheckoutSessionCreateInput): Promise<CheckoutSession> {
    return this.request(
      { method: "POST", path: "/v1/checkout-sessions", body: input },
      checkoutSessionSchema,
    );
  }

  /** One of your account's public-API sessions. */
  get(id: string): Promise<CheckoutSession> {
    return this.request(
      { method: "GET", path: this.sessionPath(id) },
      checkoutSessionSchema,
    );
  }

  /** One page of sessions, newest first. */
  list(input: CheckoutSessionListInput = {}): Promise<CheckoutSessionList> {
    const query = new URLSearchParams();
    if (input.status !== undefined) query.set("status", input.status);
    if (input.page !== undefined) query.set("page", String(input.page));
    if (input.pageSize !== undefined) {
      query.set("pageSize", String(input.pageSize));
    }
    const search = query.toString();
    return this.request(
      {
        method: "GET",
        path: `/v1/checkout-sessions${search ? `?${search}` : ""}`,
      },
      checkoutSessionListSchema,
    );
  }

  /**
   * Cancels an open session. A second cancel returns the already-canceled
   * session and changes nothing.
   */
  cancel(id: string): Promise<CheckoutSession> {
    return this.request(
      { method: "POST", path: `${this.sessionPath(id)}/cancel` },
      checkoutSessionSchema,
    );
  }

  private sessionPath(id: string): string {
    return `/v1/checkout-sessions/${encodeURIComponent(id)}`;
  }

  private async request<T>(
    options: RequestOptions,
    schema: z.ZodType<T>,
  ): Promise<T> {
    const headers: Record<string, string> = {
      authorization: `Bearer ${this.config.apiKey}`,
      accept: "application/json",
    };
    const init: RequestInit = { method: options.method, headers };
    if (options.body !== undefined) {
      headers["content-type"] = "application/json";
      init.body = JSON.stringify(options.body);
    }

    const response = await this.config.fetch(
      `${this.config.baseUrl}${options.path}`,
      init,
    );
    const text = await response.text();
    const body = text.length === 0 ? undefined : parseJson(text);

    if (!response.ok) {
      throw checkoutApiErrorFromResponse(response, body);
    }
    return schema.parse(body);
  }
}

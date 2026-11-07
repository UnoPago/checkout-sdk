import { z } from "zod";

/** One field-level problem the API reported for a rejected request. */
export type CheckoutApiIssue = {
  /** The Spanish copy for the field. */
  message: string;
  /** The request path the issue belongs to, when the API includes it. */
  path?: (string | number)[];
};

const checkoutApiErrorBodySchema = z.object({
  message: z.string().optional(),
  code: z.string().optional(),
  data: z
    .object({
      errorCode: z.string().optional(),
    })
    .optional(),
  issues: z
    .array(
      z.object({
        message: z.string().min(1),
        path: z.array(z.union([z.string(), z.number()])).optional(),
      }),
    )
    .optional(),
});

/**
 * A request the API answered with a non-2xx status.
 *
 * `message` is the Spanish copy for the end user when the refusal is a
 * business rule; on a validation error it is the first `issues[].message`,
 * exactly as the API guide says. `code` is the REST error code
 * (`BAD_REQUEST`, `CONFLICT`, `TOO_MANY_REQUESTS`, …) and `errorCode` the
 * optional stable discriminator under `data.errorCode` (`CHARGE_REJECTED`,
 * …) that callers branch on.
 *
 * A network failure — no response at all — is not mapped: the underlying
 * `fetch` error is thrown unwrapped.
 */
export class CheckoutApiError extends Error {
  readonly status: number;
  readonly code: string | null;
  readonly errorCode: string | null;
  readonly issues: readonly CheckoutApiIssue[] | null;

  constructor(input: {
    status: number;
    code: string | null;
    message: string;
    errorCode: string | null;
    issues: readonly CheckoutApiIssue[] | null;
  }) {
    super(input.message);
    this.name = "CheckoutApiError";
    this.status = input.status;
    this.code = input.code;
    this.errorCode = input.errorCode;
    this.issues = input.issues;
  }
}

/** Maps a non-2xx response's `{ message, code, data, issues }` body. */
export function checkoutApiErrorFromResponse(
  response: Response,
  body: unknown,
): CheckoutApiError {
  const parsed = checkoutApiErrorBodySchema.safeParse(body);
  const envelope = parsed.success ? parsed.data : undefined;
  const issues = envelope?.issues ?? null;

  return new CheckoutApiError({
    status: response.status,
    code: envelope?.code ?? null,
    errorCode: envelope?.data?.errorCode ?? null,
    issues,
    // A validation failure's real, user-facing copy is in `issues[]`;
    // `message` is the generic "Input validation failed".
    message:
      issues?.[0]?.message ??
      envelope?.message ??
      `UnoPago API request failed with status ${response.status}`,
  });
}

/**
 * Bounds on the customer-supplied free text in a public return request.
 *
 * Kept out of `lib/public-return-requests.ts` because the storefront form is
 * a client component and cannot import a "server-only" module — both sides
 * must agree on the same numbers.
 */
export const MAX_RETURN_REASON_LENGTH = 500;
export const MAX_RETURN_NOTE_LENGTH = 1000;

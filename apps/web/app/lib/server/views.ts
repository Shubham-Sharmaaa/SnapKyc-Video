import type { SessionRow } from "./db";

// What the customer's browser is allowed to see about their own session.
export function toCustomerView(row: SessionRow) {
  return {
    id: row.id,
    status: row.status,
    inIndia: row.in_india,
    name: row.customer_name,
    dob: row.customer_dob,
    photo: row.customer_photo,
    decisionReason: row.status === "rejected" ? row.decision_reason : null,
    kycToken: row.status === "approved" ? row.kyc_token : null,
    tokenExpiresAt: row.status === "approved" ? row.token_expires_at : null,
  };
}

export type CustomerView = ReturnType<typeof toCustomerView>;

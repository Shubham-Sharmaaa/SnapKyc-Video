// Pure business rules for a KYC session. No I/O here, so they are easy to test
// and every API route enforces exactly the same checks.

export type SessionStatus =
  | "consented"
  | "id_verified"
  | "in_call"
  | "pending_review"
  | "approved"
  | "rejected";

export type StaffRole = "agent" | "reviewer";

export type StaffUser = {
  id: string;
  name: string;
  roles: StaffRole[];
};

export type SessionFacts = {
  status: SessionStatus;
  agent_id: string | null;
  snapshot_path: string | null;
  recording_path: string | null;
};

export type RuleResult =
  | { ok: true }
  | { ok: false; httpStatus: number; error: string };

const allow: RuleResult = { ok: true };

function deny(httpStatus: number, error: string): RuleResult {
  return { ok: false, httpStatus, error };
}

export const CONSENT_TEXT =
  "I agree to complete my KYC over a live video call with a bank official. " +
  "I understand the call will be recorded, my photo will be captured, and my " +
  "current location will be saved with this session.";

// Rough bounding box for India. Good enough to flag a session for the agent;
// a real system would reverse-geocode and also check the IP address.
export function isInIndia(latitude: number, longitude: number) {
  return latitude >= 6.5 && latitude <= 35.7 && longitude >= 68.1 && longitude <= 97.4;
}

export function canVerifyIdentity(session: SessionFacts): RuleResult {
  if (session.status !== "consented") {
    return deny(409, "Identity has already been checked for this session");
  }
  return allow;
}

export function canCustomerJoinCall(session: SessionFacts): RuleResult {
  if (session.status !== "id_verified" && session.status !== "in_call") {
    return deny(409, "This session is not ready for a video call");
  }
  return allow;
}

export function canClaim(session: SessionFacts, user: StaffUser): RuleResult {
  if (!user.roles.includes("agent")) {
    return deny(403, "Only agents can take calls");
  }
  if (session.status === "in_call" && session.agent_id === user.id) return allow;
  if (session.status !== "id_verified") {
    return deny(409, "This customer is not waiting for an agent");
  }
  return allow;
}

export function canRunCall(session: SessionFacts, user: StaffUser): RuleResult {
  if (!user.roles.includes("agent")) {
    return deny(403, "Only agents can run calls");
  }
  if (session.status !== "in_call") {
    return deny(409, "This session is not in a call");
  }
  if (session.agent_id !== user.id) {
    return deny(403, "This call belongs to another agent");
  }
  return allow;
}

export function canRecommend(session: SessionFacts, user: StaffUser): RuleResult {
  const call = canRunCall(session, user);
  if (!call.ok) return call;
  if (!session.snapshot_path) {
    return deny(409, "Take a face snapshot before recommending");
  }
  if (!session.recording_path) {
    return deny(409, "Save the call recording before recommending");
  }
  return allow;
}

// Maker-checker: whoever ran the call can never decide it.
export function canDecide(session: SessionFacts, user: StaffUser): RuleResult {
  if (!user.roles.includes("reviewer")) {
    return deny(403, "Only reviewers can approve or reject");
  }
  if (session.status !== "pending_review") {
    return deny(409, "This session is not waiting for review");
  }
  if (session.agent_id === user.id) {
    return deny(
      403,
      "Maker-checker: you ran this call, so a different reviewer must decide it",
    );
  }
  return allow;
}

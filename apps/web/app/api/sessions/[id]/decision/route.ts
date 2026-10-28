import { NextResponse } from "next/server";
import { updateSessionIf } from "@repo/db";
import { canDecide } from "@repo/kyc";
import { issueKycToken } from "@repo/kyc/token";
import { requireEnv } from "../../../../lib/server/env";
import { jsonError, readJson, ruleError } from "../../../../lib/server/http";
import { loadStaffSession } from "../../../../lib/server/staffSession";

// Checker step. Only this route can produce a KYC token, and canDecide blocks
// the agent who ran the call from approving it.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const loaded = await loadStaffSession(params);
  if (!loaded.ok) return loaded.response;
  const { user, session } = loaded;

  const rule = canDecide(session, user);
  if (!rule.ok) return ruleError(rule);

  const body = await readJson(req);
  const decision = body.decision;
  const reason = String(body.reason ?? "").trim().slice(0, 2000);
  if (decision !== "approved" && decision !== "rejected") {
    return jsonError(400, "decision must be approved or rejected");
  }
  if (decision === "rejected" && !reason) {
    return jsonError(400, "Give the customer a reason for the rejection");
  }

  const issued =
    decision === "approved"
      ? issueKycToken(
          requireEnv("KYC_TOKEN_SECRET"),
          session.id,
          session.customer_name ?? "Unknown",
        )
      : null;

  const updated = await updateSessionIf(session.id, "pending_review", {
    status: decision,
    decision,
    decision_reason: reason || null,
    reviewer_id: user.id,
    decided_at: new Date().toISOString(),
    kyc_token: issued?.token ?? null,
    token_expires_at: issued?.expiresAt.toISOString() ?? null,
  });
  if (!updated) return jsonError(409, "Session was already decided");

  return NextResponse.json({ ok: true, status: updated.status });
}

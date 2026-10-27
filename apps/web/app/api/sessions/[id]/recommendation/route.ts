import { NextResponse } from "next/server";
import { canRecommend } from "../../../../lib/rules";
import { updateSessionIf } from "../../../../lib/server/db";
import { jsonError, readJson, ruleError } from "../../../../lib/server/http";
import { loadStaffSession } from "../../../../lib/server/staffSession";

// Maker step: the agent recommends, but cannot decide.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const loaded = await loadStaffSession(params);
  if (!loaded.ok) return loaded.response;
  const { user, session } = loaded;

  const rule = canRecommend(session, user);
  if (!rule.ok) return ruleError(rule);

  const body = await readJson(req);
  const recommendation = body.recommendation;
  if (recommendation !== "approve" && recommendation !== "reject") {
    return jsonError(400, "recommendation must be approve or reject");
  }
  const notes = String(body.notes ?? "").trim().slice(0, 2000);

  const updated = await updateSessionIf(session.id, "in_call", {
    status: "pending_review",
    recommendation,
    agent_notes: notes || null,
    recommended_at: new Date().toISOString(),
  });
  if (!updated) return jsonError(409, "Session changed, please refresh");

  return NextResponse.json({ ok: true });
}

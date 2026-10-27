import { NextResponse } from "next/server";
import { canClaim } from "../../../../lib/rules";
import { updateSessionIf } from "../../../../lib/server/db";
import { jsonError, ruleError } from "../../../../lib/server/http";
import { pickQuestions } from "../../../../lib/server/questions";
import { loadStaffSession } from "../../../../lib/server/staffSession";

// Agent picks up a waiting customer. The conditional update means only one
// agent can win if two click at the same time.
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const loaded = await loadStaffSession(params);
  if (!loaded.ok) return loaded.response;
  const { user, session } = loaded;

  const rule = canClaim(session, user);
  if (!rule.ok) return ruleError(rule);
  if (session.status === "in_call") return NextResponse.json({ ok: true });

  const updated = await updateSessionIf(session.id, "id_verified", {
    status: "in_call",
    agent_id: user.id,
    call_started_at: new Date().toISOString(),
    questions: pickQuestions(),
  });
  if (!updated) return jsonError(409, "Another agent already took this call");

  return NextResponse.json({ ok: true });
}

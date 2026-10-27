import { NextResponse } from "next/server";
import { canCustomerJoinCall } from "../../../../lib/rules";
import { getCustomerSessionId } from "../../../../lib/server/auth";
import { getSession } from "../../../../lib/server/db";
import { jsonError, ruleError } from "../../../../lib/server/http";
import { issueCallToken } from "../../../../lib/server/signalToken";

export async function POST() {
  const sessionId = await getCustomerSessionId();
  const session = sessionId ? await getSession(sessionId) : null;
  if (!session) return jsonError(401, "Start a KYC session first");

  const rule = canCustomerJoinCall(session);
  if (!rule.ok) return ruleError(rule);

  return NextResponse.json({ token: issueCallToken(session.id, "customer") });
}

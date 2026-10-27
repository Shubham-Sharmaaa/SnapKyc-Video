import { NextResponse } from "next/server";
import { canRunCall } from "../../../../lib/rules";
import { ruleError } from "../../../../lib/server/http";
import { issueCallToken } from "../../../../lib/server/signalToken";
import { loadStaffSession } from "../../../../lib/server/staffSession";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const loaded = await loadStaffSession(params);
  if (!loaded.ok) return loaded.response;
  const { user, session } = loaded;

  const rule = canRunCall(session, user);
  if (!rule.ok) return ruleError(rule);

  return NextResponse.json({ token: issueCallToken(session.id, "agent") });
}

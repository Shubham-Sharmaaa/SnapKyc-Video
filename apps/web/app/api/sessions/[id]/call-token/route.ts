import { NextResponse } from "next/server";
import { canRunCall } from "@repo/kyc";
import { signRoomToken } from "@repo/signaling/token";
import { requireEnv } from "../../../../lib/server/env";
import { ruleError } from "../../../../lib/server/http";
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

  const token = signRoomToken(requireEnv("SIGNAL_SECRET"), session.id, "agent");
  return NextResponse.json({ token });
}

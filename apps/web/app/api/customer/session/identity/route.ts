import { NextResponse } from "next/server";
import { canVerifyIdentity } from "@repo/kyc";
import { getSession, updateSessionIf } from "@repo/db";
import { mockSnapKycLookup } from "@repo/kyc/snapkyc";
import { getCustomerSessionId } from "../../../../lib/server/auth";
import { jsonError, readJson, ruleError } from "../../../../lib/server/http";
import { toCustomerView } from "../../../../lib/server/views";

// Step 2: run the (mock) SnapKYC check and keep only the result, never the
// Aadhaar number.
export async function POST(req: Request) {
  const sessionId = await getCustomerSessionId();
  const session = sessionId ? await getSession(sessionId) : null;
  if (!session) return jsonError(401, "Start a KYC session first");

  const rule = canVerifyIdentity(session);
  if (!rule.ok) return ruleError(rule);

  const body = await readJson(req);
  const result = mockSnapKycLookup(String(body.idNumber ?? ""));
  if (!result.ok) return jsonError(422, result.error);

  const updated = await updateSessionIf(session.id, "consented", {
    status: "id_verified",
    snapkyc_ref: result.ref,
    customer_name: result.name,
    customer_dob: result.dob,
    customer_photo: result.photo,
    id_verified_at: new Date().toISOString(),
  });
  if (!updated) return jsonError(409, "Session changed, please refresh");

  return NextResponse.json({ session: toCustomerView(updated) });
}

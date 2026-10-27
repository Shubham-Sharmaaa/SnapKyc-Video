import { NextResponse } from "next/server";
import { jsonError, readJson } from "../../lib/server/http";
import { mockSnapKycLookup } from "../../lib/server/mockSnapKyc";

// Fake SnapKYC endpoint: POST { idNumber } -> dummy name, date of birth and
// photo. The customer flow calls mockSnapKycLookup() directly; this route
// exposes the same mock for manual testing.
export async function POST(req: Request) {
  const body = await readJson(req);
  const result = mockSnapKycLookup(String(body.idNumber ?? ""));
  if (!result.ok) return jsonError(422, result.error);

  const { ref, name, dob, photo } = result;
  return NextResponse.json({ ref, name, dob, photo });
}

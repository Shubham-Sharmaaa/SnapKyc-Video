import { NextResponse } from "next/server";
import { readJson } from "../../lib/server/http";
import { verifyKycToken } from "../../lib/server/kycToken";

// Public: anyone can check a KYC token. Validity is the signature + expiry;
// no database lookup is needed.
export async function POST(req: Request) {
  const body = await readJson(req);
  const token = typeof body.token === "string" ? body.token.slice(0, 8192) : "";
  return NextResponse.json(verifyKycToken(token));
}

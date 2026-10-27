import { NextResponse } from "next/server";
import { clearStaffCookie } from "../../../lib/server/auth";

export async function POST() {
  await clearStaffCookie();
  return NextResponse.json({ ok: true });
}

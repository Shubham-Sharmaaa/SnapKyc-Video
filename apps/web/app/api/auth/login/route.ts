import { NextResponse } from "next/server";
import { findDemoUser, setStaffCookie } from "../../../lib/server/auth";
import { jsonError, readJson } from "../../../lib/server/http";

export async function POST(req: Request) {
  const body = await readJson(req);
  const user = findDemoUser(body.username, body.password);
  if (!user) return jsonError(401, "Wrong username or password");

  await setStaffCookie(user);
  return NextResponse.json({ user });
}

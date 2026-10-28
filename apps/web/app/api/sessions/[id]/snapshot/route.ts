import { NextResponse } from "next/server";
import { signedViewUrl, updateSessionIf, uploadSnapshot } from "@repo/db";
import { canRunCall } from "@repo/kyc";
import { jsonError, readJson, ruleError } from "../../../../lib/server/http";
import { loadStaffSession } from "../../../../lib/server/staffSession";

const MAX_SNAPSHOT_BYTES = 2 * 1024 * 1024;

// Agent captures a frame of the customer's video as a JPEG data URL.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const loaded = await loadStaffSession(params);
  if (!loaded.ok) return loaded.response;
  const { user, session } = loaded;

  const rule = canRunCall(session, user);
  if (!rule.ok) return ruleError(rule);

  const body = await readJson(req);
  const match = /^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/.exec(
    String(body.image ?? ""),
  );
  if (!match?.[1]) return jsonError(400, "Expected a JPEG image");

  const jpeg = Buffer.from(match[1], "base64");
  if (jpeg.length === 0 || jpeg.length > MAX_SNAPSHOT_BYTES) {
    return jsonError(413, "Snapshot is empty or too large");
  }

  const path = await uploadSnapshot(session.id, jpeg);
  const updated = await updateSessionIf(session.id, "in_call", {
    snapshot_path: path,
    snapshot_taken_at: new Date().toISOString(),
  });
  if (!updated) return jsonError(409, "Session changed, please refresh");

  return NextResponse.json({ snapshotUrl: await signedViewUrl(path) });
}

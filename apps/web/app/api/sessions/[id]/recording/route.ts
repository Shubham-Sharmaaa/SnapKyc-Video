import { NextResponse } from "next/server";
import { canRunCall } from "../../../../lib/rules";
import { updateSessionIf } from "../../../../lib/server/db";
import { jsonError, readJson, ruleError } from "../../../../lib/server/http";
import {
  createRecordingUploadUrl,
  fileExists,
  RECORDING_TYPES,
  recordingPath,
  type RecordingType,
} from "../../../../lib/server/storage";
import { loadStaffSession } from "../../../../lib/server/staffSession";

function readType(value: unknown): RecordingType | null {
  const base = String(value ?? "").split(";")[0]?.trim() ?? "";
  return base in RECORDING_TYPES ? (base as RecordingType) : null;
}

// Two steps, both by the agent who runs the call:
//   { action: "start", contentType }  -> signed URL the browser PUTs the video to
//   { action: "finish", contentType } -> check the file landed, then save its path
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
  const type = readType(body.contentType);
  if (!type) return jsonError(400, "Recording must be video/webm or video/mp4");
  const path = recordingPath(session.id, type);

  if (body.action === "start") {
    return NextResponse.json({ uploadUrl: await createRecordingUploadUrl(path) });
  }

  if (body.action === "finish") {
    if (!(await fileExists(path))) {
      return jsonError(409, "Recording upload not found, please try again");
    }
    const updated = await updateSessionIf(session.id, "in_call", {
      recording_path: path,
      recording_saved_at: new Date().toISOString(),
    });
    if (!updated) return jsonError(409, "Session changed, please refresh");
    return NextResponse.json({ ok: true });
  }

  return jsonError(400, "action must be start or finish");
}

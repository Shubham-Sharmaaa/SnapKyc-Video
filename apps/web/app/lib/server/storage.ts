import { supabase } from "./db";

const BUCKET = process.env.SUPABASE_BUCKET ?? "kyc-media";

export const RECORDING_TYPES = {
  "video/webm": "webm",
  "video/mp4": "mp4",
} as const;

export type RecordingType = keyof typeof RECORDING_TYPES;

export function snapshotPath(sessionId: string) {
  return `sessions/${sessionId}/snapshot.jpg`;
}

export function recordingPath(sessionId: string, type: RecordingType) {
  return `sessions/${sessionId}/recording.${RECORDING_TYPES[type]}`;
}

export async function uploadSnapshot(sessionId: string, jpeg: Buffer) {
  const path = snapshotPath(sessionId);
  const { error } = await supabase()
    .storage.from(BUCKET)
    .upload(path, jpeg, { contentType: "image/jpeg", upsert: true });
  if (error) throw new Error(`Could not save snapshot: ${error.message}`);
  return path;
}

// Recordings go straight from the browser to storage with a one-time signed
// URL. Serverless functions have small body limits (4.5 MB on Vercel), so the
// video never passes through our API.
export async function createRecordingUploadUrl(path: string) {
  const { data, error } = await supabase()
    .storage.from(BUCKET)
    .createSignedUploadUrl(path, { upsert: true });
  if (error) throw new Error(`Could not create upload URL: ${error.message}`);
  return data.signedUrl;
}

export async function fileExists(path: string) {
  const slash = path.lastIndexOf("/");
  const folder = path.slice(0, slash);
  const name = path.slice(slash + 1);
  const { data, error } = await supabase()
    .storage.from(BUCKET)
    .list(folder, { search: name });
  if (error) throw new Error(`Could not check file: ${error.message}`);
  return data.some(
    (file) => file.name === name && Number(file.metadata?.size ?? 0) > 0,
  );
}

export async function signedViewUrl(path: string | null, expiresIn = 60 * 60) {
  if (!path) return null;
  const { data, error } = await supabase()
    .storage.from(BUCKET)
    .createSignedUrl(path, expiresIn);
  if (error) return null;
  return data.signedUrl;
}

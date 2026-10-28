import type { SessionStatus } from "@repo/kyc";
import { supabase } from "./client";

// One row of kyc_sessions (see ../schema.sql).
export type SessionRow = {
  id: string;
  status: SessionStatus;
  created_at: string;
  consent_text: string;
  consent_given_at: string;
  latitude: number;
  longitude: number;
  location_accuracy_m: number | null;
  location_captured_at: string;
  in_india: boolean;
  snapkyc_ref: string | null;
  customer_name: string | null;
  customer_dob: string | null;
  customer_photo: string | null;
  id_verified_at: string | null;
  agent_id: string | null;
  call_started_at: string | null;
  questions: string[] | null;
  snapshot_path: string | null;
  snapshot_taken_at: string | null;
  recording_path: string | null;
  recording_saved_at: string | null;
  recommendation: "approve" | "reject" | null;
  agent_notes: string | null;
  recommended_at: string | null;
  reviewer_id: string | null;
  decision: "approved" | "rejected" | null;
  decision_reason: string | null;
  decided_at: string | null;
  kyc_token: string | null;
  token_expires_at: string | null;
};

const TABLE = "kyc_sessions";

export async function createSession(
  values: Partial<SessionRow> &
    Pick<
      SessionRow,
      | "consent_text"
      | "consent_given_at"
      | "latitude"
      | "longitude"
      | "location_captured_at"
      | "in_india"
    >,
) {
  const { data, error } = await supabase()
    .from(TABLE)
    .insert(values)
    .select()
    .single();
  if (error) throw new Error(`Could not create session: ${error.message}`);
  return data as SessionRow;
}

export async function getSession(id: string) {
  const { data, error } = await supabase()
    .from(TABLE)
    .select()
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`Could not load session: ${error.message}`);
  return data as SessionRow | null;
}

// Updates the row only if it is still in the expected status, so two agents
// (or two reviewers) clicking at once cannot both win. Returns null on a race.
export async function updateSessionIf(
  id: string,
  expectedStatus: SessionStatus,
  patch: Partial<SessionRow>,
) {
  const { data, error } = await supabase()
    .from(TABLE)
    .update(patch)
    .eq("id", id)
    .eq("status", expectedStatus)
    .select()
    .maybeSingle();
  if (error) throw new Error(`Could not update session: ${error.message}`);
  return data as SessionRow | null;
}

export async function listSessions(statuses: SessionStatus[], limit = 50) {
  const { data, error } = await supabase()
    .from(TABLE)
    .select()
    .in("status", statuses)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`Could not list sessions: ${error.message}`);
  return data as SessionRow[];
}

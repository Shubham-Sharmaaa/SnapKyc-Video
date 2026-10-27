import type { StaffUser } from "../rules";
import { getStaff } from "./auth";
import { getSession, type SessionRow } from "./db";
import { isUuid, jsonError } from "./http";

type Loaded =
  | { ok: true; user: StaffUser; session: SessionRow }
  | { ok: false; response: Response };

// Shared first step of every staff route: who is calling, and which session.
export async function loadStaffSession(
  params: Promise<{ id: string }>,
): Promise<Loaded> {
  const user = await getStaff();
  if (!user) return { ok: false, response: jsonError(401, "Please log in") };

  const { id } = await params;
  const session = isUuid(id) ? await getSession(id) : null;
  if (!session) return { ok: false, response: jsonError(404, "Session not found") };

  return { ok: true, user, session };
}

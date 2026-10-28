import jwt from "jsonwebtoken";
import type { Role } from "./messages.js";
import { isValidRoomId } from "./protocol.js";

// Short-lived room credential. The web app signs it after checking who the
// caller is; the signal server verifies it with the same SIGNAL_SECRET and
// only admits the socket to the room named inside it.
// Server-only: import from "@repo/signaling/token", never from the browser.

export type RoomClaims = { roomId: string; role: Role };

const ROOM_TOKEN_TTL = "10m";
const MAX_TOKEN_LENGTH = 4096;

export function signRoomToken(secret: string, roomId: string, role: Role) {
  return jwt.sign({ roomId, role }, secret, {
    algorithm: "HS256",
    expiresIn: ROOM_TOKEN_TTL,
  });
}

// Returns the room and role, or null for anything not signed by us, expired
// or malformed.
export function verifyRoomToken(secret: string, token: unknown): RoomClaims | null {
  if (typeof token !== "string" || token.length === 0 || token.length > MAX_TOKEN_LENGTH) {
    return null;
  }
  let claims;
  try {
    claims = jwt.verify(token, secret, { algorithms: ["HS256"] });
  } catch {
    return null;
  }
  if (typeof claims === "string" || typeof claims.exp !== "number") return null;

  const { roomId, role } = claims;
  if (!isValidRoomId(roomId)) return null;
  if (role !== "agent" && role !== "customer") return null;
  return { roomId, role };
}

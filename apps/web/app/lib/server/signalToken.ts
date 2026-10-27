import jwt from "jsonwebtoken";
import type { Role } from "@repo/types";
import { requireEnv } from "./env";

// Short-lived credential for the signaling server. The signal server shares
// SIGNAL_SECRET and only lets a token join the room named inside it.
export function issueCallToken(roomId: string, role: Role) {
  return jwt.sign({ roomId, role }, requireEnv("SIGNAL_SECRET"), {
    algorithm: "HS256",
    expiresIn: "10m",
  });
}

import dotenv from "dotenv";
dotenv.config();
import { signRoomToken } from "@repo/signaling/token";

const secret = process.env.SIGNAL_SECRET;
if (!secret) throw new Error("SIGNAL_SECRET is not configured");

console.log("Customer Token:", signRoomToken(secret, "room123", "customer"));
console.log("Agent Token:", signRoomToken(secret, "room123", "agent"));

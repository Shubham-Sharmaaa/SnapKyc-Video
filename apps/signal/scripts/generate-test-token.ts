import dotenv from "dotenv";
dotenv.config();
import jwt from "jsonwebtoken";

const secret = process.env.SIGNAL_SECRET;
if (!secret) throw new Error("SIGNAL_SECRET is not configured");
function generateTestToken(role: "agent" | "customer") {
  const payload = { roomId: "room123", role };
  const token = jwt.sign(payload, secret!, {
    expiresIn: "10m",
    algorithm: "HS256",
  });
  return token;
}

const customerToken = generateTestToken("customer");
const agentToken = generateTestToken("agent");

console.log("Customer Token:", customerToken);
console.log("Agent Token:", agentToken);

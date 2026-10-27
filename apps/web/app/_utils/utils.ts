import jwt from "jsonwebtoken";

export function generateTestToken(
  roomId: string,
  role: "agent" | "customer",
  secret: string,
) {
  const payload = { roomId, role };
  const token = jwt.sign(payload, secret!, {
    expiresIn: "10m",
    algorithm: "HS256",
  });
  return token;
}

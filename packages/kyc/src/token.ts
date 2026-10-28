import { randomUUID } from "node:crypto";
import jwt from "jsonwebtoken";

// The KYC token given to an approved customer. The caller passes the secret
// (KYC_TOKEN_SECRET), so this module never reads the environment.
// Server-only: import from "@repo/kyc/token", never from the browser.

export const KYC_TOKEN_ISSUER = "snapkyc-video";
export const KYC_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60;

export type KycClaims = {
  name: string;
  kyc_status: "verified";
  sub: string;
  iss: string;
  iat: number;
  exp: number;
  jti: string;
};

export type KycVerifyResult =
  | { valid: true; claims: KycClaims }
  | { valid: false; reason: string; claims: Partial<KycClaims> | null };

export function issueKycToken(secret: string, sessionId: string, name: string) {
  const token = jwt.sign(
    { name, kyc_status: "verified" },
    secret,
    {
      algorithm: "HS256",
      issuer: KYC_TOKEN_ISSUER,
      subject: sessionId,
      jwtid: randomUUID(),
      expiresIn: KYC_TOKEN_TTL_SECONDS,
    },
  );
  const expiresAt = new Date(Date.now() + KYC_TOKEN_TTL_SECONDS * 1000);
  return { token, expiresAt };
}

function readClaims(token: string): Partial<KycClaims> | null {
  const decoded = jwt.decode(token);
  return decoded && typeof decoded === "object"
    ? (decoded as Partial<KycClaims>)
    : null;
}

export function verifyKycToken(secret: string, token: string): KycVerifyResult {
  const trimmed = token.trim();
  if (!trimmed) return { valid: false, reason: "No token given", claims: null };

  try {
    const claims = jwt.verify(trimmed, secret, {
      algorithms: ["HS256"],
      issuer: KYC_TOKEN_ISSUER,
    });
    if (
      typeof claims === "string" ||
      typeof claims.name !== "string" ||
      claims.kyc_status !== "verified"
    ) {
      return { valid: false, reason: "Token is not a KYC token", claims: null };
    }
    return { valid: true, claims: claims as KycClaims };
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      return { valid: false, reason: "Token has expired", claims: readClaims(trimmed) };
    }
    if (err instanceof jwt.JsonWebTokenError) {
      const reason =
        err.message === "invalid signature"
          ? "Signature does not match: the token was not issued by this server or was changed"
          : `Invalid token (${err.message})`;
      return { valid: false, reason, claims: readClaims(trimmed) };
    }
    throw err;
  }
}

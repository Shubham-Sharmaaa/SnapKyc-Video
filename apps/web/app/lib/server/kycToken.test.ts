import assert from "node:assert/strict";
import { before, describe, it } from "node:test";
import jwt from "jsonwebtoken";
import { issueKycToken, KYC_TOKEN_ISSUER, verifyKycToken } from "./kycToken";

before(() => {
  process.env.KYC_TOKEN_SECRET = "test-secret";
});

describe("KYC token", () => {
  it("issues a token that verifies, with name, status and expiry", () => {
    const { token, expiresAt } = issueKycToken("session-1", "Aarav Sharma");
    const result = verifyKycToken(token);
    assert.equal(result.valid, true);
    if (!result.valid) return;
    assert.equal(result.claims.name, "Aarav Sharma");
    assert.equal(result.claims.kyc_status, "verified");
    assert.equal(result.claims.sub, "session-1");
    assert.ok(Math.abs(result.claims.exp * 1000 - expiresAt.getTime()) < 2000);
  });

  it("rejects a token signed with another key", () => {
    const forged = jwt.sign({ name: "Mallory", kyc_status: "verified" }, "wrong-key", {
      issuer: KYC_TOKEN_ISSUER,
      expiresIn: 60,
    });
    const result = verifyKycToken(forged);
    assert.equal(result.valid, false);
    assert.match(!result.valid ? result.reason : "", /signature/i);
  });

  it("rejects an edited token", () => {
    const { token } = issueKycToken("session-1", "Aarav Sharma");
    const [header, , signature] = token.split(".");
    const payload = Buffer.from(
      JSON.stringify({ name: "Someone Else", kyc_status: "verified", iss: KYC_TOKEN_ISSUER }),
    ).toString("base64url");
    assert.equal(verifyKycToken(`${header}.${payload}.${signature}`).valid, false);
  });

  it("rejects an expired token", () => {
    const expired = jwt.sign(
      { name: "Aarav Sharma", kyc_status: "verified", exp: Math.floor(Date.now() / 1000) - 60 },
      "test-secret",
      { issuer: KYC_TOKEN_ISSUER },
    );
    const result = verifyKycToken(expired);
    assert.equal(result.valid, false);
    assert.match(!result.valid ? result.reason : "", /expired/i);
  });

  it("rejects garbage", () => {
    assert.equal(verifyKycToken("not-a-token").valid, false);
    assert.equal(verifyKycToken("").valid, false);
  });
});

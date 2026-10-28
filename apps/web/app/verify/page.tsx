"use client";

import { useEffect, useState } from "react";
import type { KycVerifyResult } from "@repo/kyc/token";
import { formatTime } from "../lib/format";

async function verifyToken(token: string): Promise<KycVerifyResult> {
  const res = await fetch("/api/verify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token }),
  });
  return res.json();
}

export default function VerifyPage() {
  const [token, setToken] = useState("");
  const [result, setResult] = useState<KycVerifyResult | null>(null);
  const [busy, setBusy] = useState(false);

  async function check(value: string) {
    setBusy(true);
    try {
      setResult(await verifyToken(value));
    } finally {
      setBusy(false);
    }
  }

  // The QR code links here with the token in the #fragment.
  useEffect(() => {
    const fromHash = new URLSearchParams(window.location.hash.slice(1)).get("token");
    if (!fromHash) return;
    let cancelled = false;
    verifyToken(fromHash)
      .then((verified) => {
        if (cancelled) return;
        setToken(fromHash);
        setResult(verified);
      })
      .catch(console.error);
    return () => {
      cancelled = true;
    };
  }, []);

  const claims = result?.claims;

  return (
    <main className="container narrow">
      <h1>Check a KYC token</h1>
      <p className="muted">
        Paste a token issued by SnapKYC Video. We check its signature and expiry.
      </p>
      <section className="card">
        <form
          className="form"
          onSubmit={(e) => {
            e.preventDefault();
            void check(token);
          }}
        >
          <textarea
            rows={6}
            className="mono"
            value={token}
            onChange={(e) => {
              setToken(e.target.value);
              setResult(null);
            }}
            placeholder="eyJhbGciOiJIUzI1NiIs…"
          />
          <button className="btn btn-primary" disabled={busy || !token.trim()}>
            {busy ? "Checking…" : "Check token"}
          </button>
        </form>
      </section>

      {result && (
        <section className={result.valid ? "card result-ok" : "card result-bad"}>
          <h2>{result.valid ? "✓ Valid KYC token" : "✗ Not valid"}</h2>
          {!result.valid && <p>{result.reason}</p>}
          {claims && (
            <dl>
              <dt>Name</dt>
              <dd>{claims.name ?? "—"}</dd>
              <dt>KYC status</dt>
              <dd>{claims.kyc_status ?? "—"}</dd>
              <dt>Issued by</dt>
              <dd>{claims.iss ?? "—"}</dd>
              <dt>Issued at</dt>
              <dd>{claims.iat ? formatTime(claims.iat * 1000) : "—"}</dd>
              <dt>Expires</dt>
              <dd>{claims.exp ? formatTime(claims.exp * 1000) : "—"}</dd>
            </dl>
          )}
          {!result.valid && claims && (
            <p className="muted small">
              The details above are read from the token but cannot be trusted.
            </p>
          )}
        </section>
      )}
    </main>
  );
}

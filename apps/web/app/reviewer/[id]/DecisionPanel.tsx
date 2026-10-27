"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function DecisionPanel({
  sessionId,
  ranThisCall,
}: {
  sessionId: string;
  ranThisCall: boolean;
}) {
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function decide(decision: "approved" | "rejected") {
    setBusy(true);
    setError("");
    const res = await fetch(`/api/sessions/${sessionId}/decision`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision, reason }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(data.error ?? "Could not save the decision");
      return;
    }
    router.refresh();
  }

  return (
    <div className="form">
      {/* The buttons stay enabled on purpose: the server is what enforces the rule. */}
      {ranThisCall && (
        <p className="warn">
          You ran this call. Under maker-checker the server will refuse your
          decision; another reviewer must decide it.
        </p>
      )}
      <label className="field">
        <span>Reason (required to reject, shown to the customer)</span>
        <textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
      </label>
      <div className="row">
        <button className="btn btn-primary" disabled={busy} onClick={() => decide("approved")}>
          Approve & issue token
        </button>
        <button className="btn btn-danger" disabled={busy} onClick={() => decide("rejected")}>
          Reject
        </button>
      </div>
      {error && <p className="error">{error}</p>}
    </div>
  );
}

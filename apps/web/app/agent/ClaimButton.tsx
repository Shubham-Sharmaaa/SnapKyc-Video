"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function ClaimButton({ sessionId }: { sessionId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  return (
    <>
      <button
        className="btn btn-small btn-primary"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError("");
          const res = await fetch(`/api/sessions/${sessionId}/claim`, {
            method: "POST",
          });
          if (res.ok) {
            router.push(`/agent/${sessionId}`);
            return;
          }
          const data = await res.json().catch(() => ({}));
          setError(data.error ?? "Could not take this call");
          setBusy(false);
          router.refresh();
        }}
      >
        {busy ? "Taking call…" : "Take call"}
      </button>
      {error && <span className="error small"> {error}</span>}
    </>
  );
}

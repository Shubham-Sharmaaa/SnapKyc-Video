"use client";

/* eslint-disable @next/next/no-img-element -- data URIs (mock photo, QR code) */
import { useCallback, useEffect, useState } from "react";
import QRCode from "qrcode";
import { wakeSignalServer } from "../_utils/config";
import { CallStatusLine } from "../_components/CallStatusLine";
import { VideoTile } from "../_components/VideoTile";
import { formatDate, formatTime } from "../lib/format";
import { CONSENT_TEXT } from "../lib/rules";
import type { CustomerView } from "../lib/server/views";
import { getCustomerCredential, getIceServers } from "../lib/webrtc/credentials";
import { useCall } from "../lib/webrtc/useCall";

const SAMPLE_ID_NUMBER = "234567891234";

const STEPS = ["Consent & location", "Identity check", "Video call", "Result"];

function stepIndex(session: CustomerView | null) {
  if (!session) return 0;
  switch (session.status) {
    case "consented":
      return 1;
    case "id_verified":
    case "in_call":
      return 2;
    default:
      return 3;
  }
}

async function postJson(url: string, body?: unknown) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "Something went wrong");
  return data;
}

export default function CustomerPage() {
  const [session, setSession] = useState<CustomerView | null>(null);
  const [loaded, setLoaded] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/customer/session", { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      setSession(data.session);
      setLoaded(true);
    } catch {
      // Network blip: the next poll will try again.
    }
  }, []);

  // Poll so the screen moves on when the agent or reviewer acts.
  useEffect(() => {
    const first = setTimeout(refresh, 0);
    const timer = setInterval(refresh, 3000);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [refresh]);

  const current = stepIndex(session);

  return (
    <main className="container">
      <h1>Video KYC</h1>
      <ol className="stepper">
        {STEPS.map((label, i) => (
          <li
            key={label}
            className={i < current ? "done" : i === current ? "active" : ""}
          >
            {label}
          </li>
        ))}
      </ol>

      {!loaded ? (
        <p className="muted">Loading…</p>
      ) : !session ? (
        <ConsentStep onDone={setSession} />
      ) : session.status === "consented" ? (
        <IdentityStep onDone={setSession} />
      ) : session.status === "id_verified" || session.status === "in_call" ? (
        <CallStep session={session} />
      ) : session.status === "pending_review" ? (
        <section className="card">
          <h2>Call complete</h2>
          <p>
            Thank you. A reviewer is now checking your call recording. This page
            updates by itself — keep it open.
          </p>
        </section>
      ) : session.status === "approved" ? (
        <ApprovedStep session={session} />
      ) : (
        <RejectedStep session={session} onRestart={() => setSession(null)} />
      )}
    </main>
  );
}

function ConsentStep({ onDone }: { onDone: (s: CustomerView) => void }) {
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit() {
    setBusy(true);
    setError("");
    try {
      if (!navigator.geolocation) {
        throw new Error("This browser cannot share its location");
      }
      const position = await new Promise<GeolocationPosition>((resolve, reject) =>
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 20_000,
        }),
      ).catch(() => {
        throw new Error(
          "We need your location to continue. Please allow location access and try again.",
        );
      });
      const data = await postJson("/api/customer/session", {
        consent: true,
        location: {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
        },
      });
      onDone(data.session);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card">
      <h2>Before we start</h2>
      <p className="muted">
        Video KYC must happen from inside India, on a live call that is recorded.
      </p>
      <label className="checkbox">
        <input
          type="checkbox"
          checked={agreed}
          onChange={(e) => setAgreed(e.target.checked)}
        />
        <span>{CONSENT_TEXT}</span>
      </label>
      {error && <p className="error">{error}</p>}
      <button className="btn btn-primary" disabled={!agreed || busy} onClick={submit}>
        {busy ? "Getting your location…" : "Share location and continue"}
      </button>
    </section>
  );
}

function IdentityStep({ onDone }: { onDone: (s: CustomerView) => void }) {
  const [idNumber, setIdNumber] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const data = await postJson("/api/customer/session/identity", { idNumber });
      onDone(data.session);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Check failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card">
      <h2>Check your identity with SnapKYC</h2>
      <p className="muted">
        This is a <strong>mock</strong>: no real Aadhaar data is used and the
        number is not stored. Use any dummy 12-digit number.
      </p>
      <form onSubmit={submit} className="form">
        <label className="field">
          <span>Dummy Aadhaar number</span>
          <input
            inputMode="numeric"
            value={idNumber}
            onChange={(e) => setIdNumber(e.target.value)}
            placeholder="2345 6789 1234"
            maxLength={14}
          />
        </label>
        <div className="row">
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => setIdNumber(SAMPLE_ID_NUMBER)}
          >
            Use a sample number
          </button>
          <button className="btn btn-primary" disabled={busy || !idNumber}>
            {busy ? "Waiting for approval in Aadhaar app…" : "Verify with SnapKYC"}
          </button>
        </div>
      </form>
      {error && <p className="error">{error}</p>}
    </section>
  );
}

function CallStep({ session }: { session: CustomerView }) {
  const {
    localStream,
    remoteStream,
    status,
    error,
    startCall,
    hangUp,
    retry,
    rejoinAfterRefresh,
    micEnabled,
    cameraEnabled,
    toggleMic,
    toggleCamera,
    route,
    relayOnly,
  } = useCall({ getCredential: getCustomerCredential, getIceServers });

  useEffect(() => wakeSignalServer(), []);

  // Back into the call after a refresh. Deferred so React StrictMode's
  // dev-only double mount does not start it twice.
  useEffect(() => {
    const timer = setTimeout(() => rejoinAfterRefresh(session.id, "customer"), 0);
    return () => clearTimeout(timer);
  }, [rejoinAfterRefresh, session.id]);

  const inCall = status !== "idle" && status !== "error";

  return (
    <section className="card">
      <div className="call-header">
        <IdentitySummary session={session} />
        {!session.inIndia && (
          <p className="warn">
            Your location appears to be outside India. The agent may not be able
            to complete your KYC.
          </p>
        )}
      </div>

      <div className="videos">
        <VideoTile stream={remoteStream} label="Agent" placeholder="Agent video" />
        <VideoTile stream={localStream} label="You" muted small placeholder="Your camera" />
      </div>

      <CallStatusLine
        status={status}
        error={error}
        route={route}
        relayOnly={relayOnly}
        peer="agent"
        idleText="Join the call when you are ready."
        waitingText={
          session.status === "in_call"
            ? "An agent has picked up your session, connecting…"
            : "Waiting for an agent to join…"
        }
        onRetry={retry}
      />

      <div className="row">
        {status === "idle" ? (
          <button className="btn btn-primary" onClick={() => startCall(session.id, "customer")}>
            Join video call
          </button>
        ) : !inCall ? null : (
          <>
            <button className="btn btn-ghost" onClick={toggleMic}>
              {micEnabled ? "Mute mic" : "Unmute mic"}
            </button>
            <button className="btn btn-ghost" onClick={toggleCamera}>
              {cameraEnabled ? "Camera off" : "Camera on"}
            </button>
            <button className="btn btn-danger" onClick={hangUp}>
              Leave call
            </button>
          </>
        )}
      </div>
      <p className="muted small">
        Please keep your ID card nearby. The agent will ask you a few questions
        and take a photo.
      </p>
    </section>
  );
}

function IdentitySummary({ session }: { session: CustomerView }) {
  return (
    <div className="identity">
      {session.photo && (
        <img src={session.photo} alt="Photo from SnapKYC (mock)" className="id-photo" />
      )}
      <dl>
        <dt>Name</dt>
        <dd>{session.name}</dd>
        <dt>Date of birth</dt>
        <dd>{formatDate(session.dob)}</dd>
      </dl>
    </div>
  );
}

function ApprovedStep({ session }: { session: CustomerView }) {
  const [qr, setQr] = useState("");
  const [copied, setCopied] = useState(false);
  const token = session.kycToken ?? "";
  // The QR opens the public check page; the token sits in the URL fragment,
  // which browsers never send to the server.
  const [verifyUrl, setVerifyUrl] = useState("");

  useEffect(() => {
    if (!token) return;
    const url = `${window.location.origin}/verify#token=${token}`;
    QRCode.toDataURL(url, { width: 260, margin: 1 })
      .then((dataUrl) => {
        setVerifyUrl(url);
        setQr(dataUrl);
      })
      .catch(console.error);
  }, [token]);

  return (
    <section className="card">
      <h2 className="ok">Your KYC is approved</h2>
      <p>
        Here is your signed KYC token. Anyone can scan the QR code or paste the
        token on the check page to confirm it is genuine. It expires on{" "}
        <strong>{formatTime(session.tokenExpiresAt)}</strong>.
      </p>
      <div className="token-box">
        {qr && <img src={qr} alt="KYC token QR code" className="qr" />}
        <div className="token-text">
          <textarea readOnly value={token} rows={6} className="mono" />
          <div className="row">
            <button
              className="btn btn-ghost"
              onClick={async () => {
                await navigator.clipboard.writeText(token);
                setCopied(true);
              }}
            >
              {copied ? "Copied" : "Copy token"}
            </button>
            {verifyUrl && (
              <a className="btn btn-primary" href={verifyUrl} target="_blank" rel="noreferrer">
                Check this token
              </a>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function RejectedStep({
  session,
  onRestart,
}: {
  session: CustomerView;
  onRestart: () => void;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <section className="card">
      <h2 className="warn">Your KYC was not approved</h2>
      {session.decisionReason && (
        <p>
          Reason: <strong>{session.decisionReason}</strong>
        </p>
      )}
      <p className="muted">You can start a new video KYC session and try again.</p>
      <button
        className="btn btn-primary"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          await fetch("/api/customer/session", { method: "DELETE" });
          onRestart();
          setBusy(false);
        }}
      >
        Start again
      </button>
    </section>
  );
}

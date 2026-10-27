"use client";

import type { CallRoute, CallStatus } from "../lib/webrtc/useCall";

type Props = {
  status: CallStatus;
  error: string;
  route: CallRoute | null;
  relayOnly: boolean;
  peer: string; // "agent" or "customer"
  idleText: string;
  waitingText?: string;
  onRetry: () => void;
};

// One place that turns the call state into words, so the user always knows
// what is happening, and failures always come with a way to retry.
export function CallStatusLine({
  status,
  error,
  route,
  relayOnly,
  peer,
  idleText,
  waitingText,
  onRetry,
}: Props) {
  const text = {
    idle: idleText,
    joining: "Starting your camera…",
    waiting: waitingText ?? `Waiting for the ${peer} to join…`,
    connecting: `Connecting to the ${peer}…`,
    connected: `Connected to the ${peer}`,
    reconnecting: "Connection lost, reconnecting…",
    failed: "The video connection failed.",
    error: "Could not join the call.",
  }[status];

  // getUserMedia errors arrive in browser wording; say what to do instead.
  const errorText = /permission|notallowed/i.test(error)
    ? "Camera or microphone access is blocked. Allow both for this site in your browser settings, then retry."
    : /not found|notfound/i.test(error)
      ? "No camera or microphone was found. Connect one, then retry."
      : error || "Something went wrong while joining.";

  return (
    <>
      <p className="call-status">
        {text}
        {status === "connected" && route && (
          <span className="muted small">
            {" "}
            · {route === "relay" ? "via TURN relay" : "direct peer-to-peer"}
          </span>
        )}
        {relayOnly && <span className="badge badge-test">TURN-only test</span>}
      </p>

      {(status === "failed" || status === "error") && (
        <div className="notice" role="alert">
          <p>
            {status === "failed"
              ? "Video could not get through between the two devices. A strict network or firewall may be blocking it. Check your connection, then retry."
              : errorText}
          </p>
          <button className="btn btn-primary" onClick={onRetry}>
            Retry
          </button>
        </div>
      )}
    </>
  );
}

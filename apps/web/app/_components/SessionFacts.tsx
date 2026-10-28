/* eslint-disable @next/next/no-img-element -- data URI from the mock provider */
import type { SessionRow } from "@repo/db";
import { formatDate, formatTime, mapLink } from "../lib/format";

// Identity, consent and location details shown to both agent and reviewer.
export function SessionFacts({ session }: { session: SessionRow }) {
  return (
    <div className="facts">
      <div className="identity">
        {session.customer_photo && (
          <img
            src={session.customer_photo}
            alt="Photo from SnapKYC (mock)"
            className="id-photo"
          />
        )}
        <dl>
          <dt>Name (SnapKYC)</dt>
          <dd>{session.customer_name ?? "—"}</dd>
          <dt>Date of birth</dt>
          <dd>{formatDate(session.customer_dob)}</dd>
          <dt>SnapKYC ref</dt>
          <dd className="mono">{session.snapkyc_ref ?? "—"}</dd>
        </dl>
      </div>
      <dl>
        <dt>Consent given</dt>
        <dd>{formatTime(session.consent_given_at)}</dd>
        <dt>Location</dt>
        <dd>
          <a
            href={mapLink(session.latitude, session.longitude)}
            target="_blank"
            rel="noreferrer"
          >
            {session.latitude.toFixed(4)}, {session.longitude.toFixed(4)}
          </a>
          {session.location_accuracy_m !== null &&
            ` (±${Math.round(session.location_accuracy_m)} m)`}
          {" · "}
          {session.in_india ? (
            <span className="ok">In India</span>
          ) : (
            <span className="warn">Outside India</span>
          )}
        </dd>
        <dt>Location captured</dt>
        <dd>{formatTime(session.location_captured_at)}</dd>
      </dl>
    </div>
  );
}

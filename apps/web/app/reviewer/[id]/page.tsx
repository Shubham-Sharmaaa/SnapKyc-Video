/* eslint-disable @next/next/no-img-element -- signed storage URLs */
import { notFound, redirect } from "next/navigation";
import { getSession, signedViewUrl } from "@repo/db";
import { SessionFacts } from "../../_components/SessionFacts";
import { StaffHeader } from "../../_components/StaffHeader";
import { StatusBadge } from "../../_components/StatusBadge";
import { formatTime } from "../../lib/format";
import { getStaff } from "../../lib/server/auth";
import { isUuid } from "../../lib/server/http";
import { DecisionPanel } from "./DecisionPanel";

export default async function ReviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getStaff();
  if (!user) redirect("/login");
  if (!user.roles.includes("reviewer")) redirect("/agent");

  const { id } = await params;
  const session = isUuid(id) ? await getSession(id) : null;
  if (!session) notFound();

  const [recordingUrl, snapshotUrl] = await Promise.all([
    signedViewUrl(session.recording_path),
    signedViewUrl(session.snapshot_path),
  ]);

  return (
    <main className="container">
      <StaffHeader user={user} />
      <div className="page-title">
        <h1>Review: {session.customer_name}</h1>
        <StatusBadge status={session.status} />
      </div>

      <div className="workspace">
        <section className="card">
          <h2>Call recording</h2>
          {recordingUrl ? (
            <video src={recordingUrl} controls className="recording" />
          ) : (
            <p className="muted">No recording saved.</p>
          )}

          <h2>Face check</h2>
          <div className="compare">
            <figure>
              {snapshotUrl ? (
                <img src={snapshotUrl} alt="Snapshot taken during the call" />
              ) : (
                <p className="muted">No snapshot</p>
              )}
              <figcaption>Snapshot from call · {formatTime(session.snapshot_taken_at)}</figcaption>
            </figure>
            <figure>
              {session.customer_photo && (
                <img src={session.customer_photo} alt="Photo from SnapKYC (mock)" />
              )}
              <figcaption>Photo from SnapKYC (mock)</figcaption>
            </figure>
          </div>
        </section>

        <div className="side">
          <section className="card">
            <h2>Customer</h2>
            <SessionFacts session={session} />
          </section>

          <section className="card">
            <h2>Agent</h2>
            <dl>
              <dt>Agent</dt>
              <dd>{session.agent_id}</dd>
              <dt>Call started</dt>
              <dd>{formatTime(session.call_started_at)}</dd>
              <dt>Recommendation</dt>
              <dd className={session.recommendation === "approve" ? "ok" : "warn"}>
                {session.recommendation ?? "—"}
              </dd>
              <dt>Notes</dt>
              <dd>{session.agent_notes ?? "—"}</dd>
            </dl>
            {session.questions && (
              <>
                <h3>Questions asked</h3>
                <ul className="questions">
                  {session.questions.map((q) => (
                    <li key={q}>{q}</li>
                  ))}
                </ul>
              </>
            )}
          </section>

          <section className="card">
            <h2>Decision</h2>
            {session.status === "pending_review" ? (
              <DecisionPanel
                sessionId={session.id}
                ranThisCall={session.agent_id === user.id}
              />
            ) : (
              <dl>
                <dt>Decision</dt>
                <dd>
                  <StatusBadge status={session.status} />
                </dd>
                <dt>Reviewer</dt>
                <dd>{session.reviewer_id ?? "—"}</dd>
                <dt>Decided</dt>
                <dd>{formatTime(session.decided_at)}</dd>
                <dt>Reason</dt>
                <dd>{session.decision_reason ?? "—"}</dd>
                {session.token_expires_at && (
                  <>
                    <dt>Token expires</dt>
                    <dd>{formatTime(session.token_expires_at)}</dd>
                  </>
                )}
              </dl>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}

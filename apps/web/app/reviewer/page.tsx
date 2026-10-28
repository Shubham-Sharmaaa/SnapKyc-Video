import Link from "next/link";
import { redirect } from "next/navigation";
import { listSessions } from "@repo/db";
import { AutoRefresh } from "../_components/AutoRefresh";
import { StaffHeader } from "../_components/StaffHeader";
import { StatusBadge } from "../_components/StatusBadge";
import { formatTime } from "../lib/format";
import { getStaff } from "../lib/server/auth";

export default async function ReviewQueuePage() {
  const user = await getStaff();
  if (!user) redirect("/login");
  if (!user.roles.includes("reviewer")) redirect("/agent");

  const sessions = await listSessions(["pending_review", "approved", "rejected"]);
  const pending = sessions.filter((s) => s.status === "pending_review");
  const decided = sessions.filter((s) => s.status !== "pending_review").slice(0, 20);

  return (
    <main className="container">
      <StaffHeader user={user} />
      <AutoRefresh />
      <h1>Review queue</h1>

      <section className="card">
        <h2>Waiting for review ({pending.length})</h2>
        {pending.length === 0 ? (
          <p className="muted">Nothing to review. This list refreshes by itself.</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Customer</th>
                <th>Agent</th>
                <th>Agent says</th>
                <th>Sent</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {pending.map((s) => (
                <tr key={s.id}>
                  <td>{s.customer_name}</td>
                  <td>
                    {s.agent_id}
                    {s.agent_id === user.id && <span className="warn small"> (you)</span>}
                  </td>
                  <td className={s.recommendation === "approve" ? "ok" : "warn"}>
                    {s.recommendation}
                  </td>
                  <td>{formatTime(s.recommended_at)}</td>
                  <td>
                    <Link className="btn btn-small btn-primary" href={`/reviewer/${s.id}`}>
                      Review
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="card">
        <h2>Recently decided</h2>
        {decided.length === 0 ? (
          <p className="muted">No decisions yet.</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Customer</th>
                <th>Decision</th>
                <th>Agent</th>
                <th>Reviewer</th>
                <th>Decided</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {decided.map((s) => (
                <tr key={s.id}>
                  <td>{s.customer_name}</td>
                  <td>
                    <StatusBadge status={s.status} />
                  </td>
                  <td>{s.agent_id}</td>
                  <td>{s.reviewer_id}</td>
                  <td>{formatTime(s.decided_at)}</td>
                  <td>
                    <Link className="btn btn-small btn-ghost" href={`/reviewer/${s.id}`}>
                      View
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </main>
  );
}

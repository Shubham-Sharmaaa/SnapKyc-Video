import Link from "next/link";
import { redirect } from "next/navigation";
import { listSessions } from "@repo/db";
import { AutoRefresh } from "../_components/AutoRefresh";
import { StaffHeader } from "../_components/StaffHeader";
import { StatusBadge } from "../_components/StatusBadge";
import { formatTime } from "../lib/format";
import { getStaff } from "../lib/server/auth";
import { ClaimButton } from "./ClaimButton";

export default async function AgentQueuePage() {
  const user = await getStaff();
  if (!user) redirect("/login");
  if (!user.roles.includes("agent")) redirect("/reviewer");

  const sessions = await listSessions(["id_verified", "in_call", "pending_review"]);
  const waiting = sessions.filter((s) => s.status === "id_verified");
  const mine = sessions.filter(
    (s) => s.agent_id === user.id && s.status !== "id_verified",
  );

  return (
    <main className="container">
      <StaffHeader user={user} />
      <AutoRefresh />
      <h1>Agent queue</h1>

      <section className="card">
        <h2>Customers waiting for a call ({waiting.length})</h2>
        {waiting.length === 0 ? (
          <p className="muted">Nobody is waiting. This list refreshes by itself.</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Customer</th>
                <th>Waiting since</th>
                <th>Location</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {waiting.map((s) => (
                <tr key={s.id}>
                  <td>{s.customer_name}</td>
                  <td>{formatTime(s.id_verified_at)}</td>
                  <td>
                    {s.in_india ? (
                      <span className="ok">In India</span>
                    ) : (
                      <span className="warn">Outside India</span>
                    )}
                  </td>
                  <td>
                    <ClaimButton sessionId={s.id} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="card">
        <h2>My calls</h2>
        {mine.length === 0 ? (
          <p className="muted">You have no open calls.</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Customer</th>
                <th>Status</th>
                <th>Started</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {mine.map((s) => (
                <tr key={s.id}>
                  <td>{s.customer_name}</td>
                  <td>
                    <StatusBadge status={s.status} />
                  </td>
                  <td>{formatTime(s.call_started_at)}</td>
                  <td>
                    {s.status === "in_call" && (
                      <Link className="btn btn-small btn-primary" href={`/agent/${s.id}`}>
                        Open call
                      </Link>
                    )}
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

import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getSession, signedViewUrl } from "@repo/db";
import { SessionFacts } from "../../_components/SessionFacts";
import { StaffHeader } from "../../_components/StaffHeader";
import { StatusBadge } from "../../_components/StatusBadge";
import { getStaff } from "../../lib/server/auth";
import { isUuid } from "../../lib/server/http";
import { AgentWorkspace } from "./AgentWorkspace";

export default async function AgentCallPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getStaff();
  if (!user) redirect("/login");
  if (!user.roles.includes("agent")) redirect("/reviewer");

  const { id } = await params;
  const session = isUuid(id) ? await getSession(id) : null;
  if (!session) notFound();

  const isMyCall = session.status === "in_call" && session.agent_id === user.id;

  return (
    <main className="container">
      <StaffHeader user={user} />
      <div className="page-title">
        <h1>KYC call: {session.customer_name}</h1>
        <StatusBadge status={session.status} />
      </div>

      {isMyCall ? (
        <AgentWorkspace
          sessionId={session.id}
          questions={session.questions ?? []}
          initialSnapshotUrl={await signedViewUrl(session.snapshot_path)}
          initialRecordingSaved={!!session.recording_path}
        >
          <SessionFacts session={session} />
        </AgentWorkspace>
      ) : (
        <section className="card">
          <p>
            {session.status === "in_call"
              ? "Another agent is running this call."
              : session.status === "id_verified"
                ? "This customer is waiting. Take the call from the agent queue."
                : "This call is finished."}
          </p>
          <Link href="/agent" className="btn btn-ghost">
            Back to queue
          </Link>
        </section>
      )}
    </main>
  );
}

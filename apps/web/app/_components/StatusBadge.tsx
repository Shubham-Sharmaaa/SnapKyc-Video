import type { SessionStatus } from "@repo/kyc";
import { STATUS_LABELS } from "../lib/format";

export function StatusBadge({ status }: { status: SessionStatus }) {
  return <span className={`badge badge-${status}`}>{STATUS_LABELS[status]}</span>;
}

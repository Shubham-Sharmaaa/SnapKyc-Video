import { STATUS_LABELS } from "../lib/format";
import type { SessionStatus } from "../lib/rules";

export function StatusBadge({ status }: { status: SessionStatus }) {
  return <span className={`badge badge-${status}`}>{STATUS_LABELS[status]}</span>;
}

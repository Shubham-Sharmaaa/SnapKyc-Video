export function formatTime(value: string | number | null | undefined) {
  if (value === null || value === undefined) return "—";
  return new Date(value).toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-IN", {
    timeZone: "UTC",
    dateStyle: "medium",
  });
}

export function mapLink(latitude: number, longitude: number) {
  return `https://www.openstreetmap.org/?mlat=${latitude}&mlon=${longitude}#map=14/${latitude}/${longitude}`;
}

export const STATUS_LABELS = {
  consented: "Consent given",
  id_verified: "Waiting for agent",
  in_call: "In call",
  pending_review: "Pending review",
  approved: "Approved",
  rejected: "Rejected",
} as const;

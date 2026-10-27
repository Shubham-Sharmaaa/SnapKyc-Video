import type { Role } from "@repo/types";
import { getWs } from "../../_utils/config";

export async function startMedia() {
  return navigator.mediaDevices.getUserMedia({ video: true, audio: true });
}

export function stopMedia(stream: MediaStream) {
  stream.getTracks().forEach((track) => track.stop());
}

// The page decides how to get a credential (see credentials.ts): customers
// get one from their session cookie, agents from their staff login.
export async function connectSignaling(
  roomId: string,
  role: Role,
  getCredential: (roomId: string, role: Role) => Promise<string>,
  canResume: () => boolean,
) {
  const token = await getCredential(roomId, role);
  const ws = getWs();

  ws.addEventListener(
    "open",
    () => {
      ws.send(JSON.stringify({ type: "join-room", token, resume: canResume() }));
    },
    { once: true },
  );

  return ws;
}

// Close code the signal server uses when a newer join for the same role
// replaced this socket (another tab or device). Must match apps/signal.
export const REPLACED_CLOSE_CODE = 4001;

// Test switch: add ?relay=1 to the page URL to allow only TURN relay
// candidates. If the call still connects, the TURN server works on its own.
export function relayOnly() {
  return (
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("relay") === "1"
  );
}

export function createPeerConnection(
  stream: MediaStream,
  iceServers: RTCIceServer[] = [{ urls: "stun:stun.l.google.com:19302" }],
) {
  const pc = new RTCPeerConnection({
    iceServers,
    iceTransportPolicy: relayOnly() ? "relay" : "all",
  });

  stream.getTracks().forEach((track) => {
    pc.addTrack(track, stream);
  });

  return pc;
}

export type CallRoute = "relay" | "direct";

type StatsReport = {
  type: string;
  id: string;
  selectedCandidatePairId?: string;
  nominated?: boolean;
  state?: string;
  localCandidateId?: string;
  remoteCandidateId?: string;
  candidateType?: string;
};

// Which path the connected call really uses, read from WebRTC stats:
// "relay" means the media goes through a TURN server.
export async function connectionRoute(
  pc: RTCPeerConnection,
): Promise<CallRoute | null> {
  const reports = new Map<string, StatsReport>();
  (await pc.getStats()).forEach((report: StatsReport) => {
    reports.set(report.id, report);
  });

  const all = [...reports.values()];
  const pairId = all.find((r) => r.type === "transport")?.selectedCandidatePairId;
  const pair = pairId
    ? reports.get(pairId)
    : all.find((r) => r.type === "candidate-pair" && r.nominated && r.state === "succeeded");
  if (!pair) return null;

  const ends = [pair.localCandidateId, pair.remoteCandidateId].map(
    (id) => (id ? reports.get(id)?.candidateType : undefined),
  );
  return ends.includes("relay") ? "relay" : "direct";
}

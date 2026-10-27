import type { Role } from "@repo/types";
import { getWs } from "../../_utils/config";

export async function startMedia() {
  return navigator.mediaDevices.getUserMedia({ video: true, audio: true });
}

export function stopMedia(stream: MediaStream) {
  stream.getTracks().forEach((track) => track.stop());
}

// The web page decides how to get a credential. In development it can call
// /api/test-credential; the real agent/customer pages can use Task 7 auth.
export async function connectSignaling(
  roomId: string,
  role: Role,
  getCredential: (roomId: string, role: Role) => Promise<string>,
) {
  const token = await getCredential(roomId, role);
  const ws = getWs();

  ws.addEventListener(
    "open",
    () => {
      ws.send(JSON.stringify({ type: "join-room", token }));
    },
    { once: true },
  );

  return ws;
}

export function createPeerConnection(
  stream: MediaStream,
  iceServers: RTCIceServer[] = [{ urls: "stun:stun.l.google.com:19302" }],
) {
  const pc = new RTCPeerConnection({ iceServers });

  stream.getTracks().forEach((track) => {
    pc.addTrack(track, stream);
  });

  return pc;
}

import { api, getWs } from "../../_utils/config";

export async function startMedia() {
  return navigator.mediaDevices.getUserMedia({
    video: true,
    audio: true,
  });
}
export function stopMedia(stream: MediaStream) {
  stream.getTracks().forEach((track) => track.stop());
}
export async function connectSignaling(
  roomId: string,
  role: "agent" | "customer",
) {
  try {
    const res = await api.post("/api/test-credential", {
      roomId,
      role,
    });
    const ws = getWs();
    const token = res.data.token;
    ws.onopen = () => {
      ws.send(JSON.stringify({ type: "join-room", token }));
    };
    ws.onmessage = (event: MessageEvent) => {
      const message = JSON.parse(event.data);

      console.log("message: ", message);
    };
    ws.onerror = (event) => {
      console.error("Websocket error: ", event);
    };
    ws.onclose = () => {
      console.log("Disconnected");
    };
    return ws;
  } catch (error) {
    console.log("error at connectingSignaling fn", error);
    throw new Error("Joining failed");
  }
}

export function createPeerConnection(stream: MediaStream) {
  const pc = new RTCPeerConnection({
    iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
  });

  stream.getTracks().forEach((track) => {
    pc.addTrack(track, stream);
  });

  return pc;
}

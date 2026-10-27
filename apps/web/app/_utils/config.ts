import axios from "axios";

export const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL,
  headers: {
    "Content-Type": "application/json",
  },
});

export function getWs() {
  const ws_url = process.env.NEXT_PUBLIC_WS_URL;
  if (!ws_url) throw new Error("no ws url configuration");
  return new WebSocket(ws_url);
}
// export const ws;

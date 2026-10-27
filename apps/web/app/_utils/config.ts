// Render's free tier sleeps after 15 minutes idle. Hitting /health early
// starts it waking up before the user presses "Join"; useCall keeps retrying
// the WebSocket until it answers.
export function wakeSignalServer() {
  const ws_url = process.env.NEXT_PUBLIC_WS_URL;
  if (!ws_url) return;
  const health = new URL("/health", ws_url.replace(/^ws/, "http"));
  fetch(health, { mode: "no-cors" }).catch(() => {});
}

export function getWs() {
  const ws_url = process.env.NEXT_PUBLIC_WS_URL;
  if (!ws_url) throw new Error("no ws url configuration");
  return new WebSocket(ws_url);
}

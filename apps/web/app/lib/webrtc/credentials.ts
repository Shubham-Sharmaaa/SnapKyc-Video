async function fetchToken(url: string) {
  const res = await fetch(url, { method: "POST" });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "Could not get call credential");
  return data.token as string;
}

// The customer's room is decided by their session cookie on the server.
export function getCustomerCredential(): Promise<string> {
  return fetchToken("/api/customer/session/call-token");
}

// The agent's room is the session id; the server checks they own the call.
export function getAgentCredential(roomId: string): Promise<string> {
  return fetchToken(`/api/sessions/${roomId}/call-token`);
}

export async function getIceServers(): Promise<RTCIceServer[]> {
  const res = await fetch("/api/ice-servers");
  if (!res.ok) throw new Error("Failed to get TURN servers");
  return res.json();
}

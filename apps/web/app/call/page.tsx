"use client";

import { useEffect, useRef, useState } from "react";
import type { Role } from "@repo/types";
import { useCall } from "../lib/webrtc/useCall";

// Task 4 will swap this for an authenticated production credential endpoint.
async function getTestCredential(roomId: string, role: Role): Promise<string> {
  const res = await fetch("/api/test-credential", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ roomId, role }),
  });
  if (!res.ok) throw new Error("Could not get call credential");
  const data = await res.json();
  return data.token;
}

export default function Page() {
  const [roomId, setRoomId] = useState("test-room");
  const [role, setRole] = useState<Role>("agent");
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const { localStream, remoteStream, status, error, startCall, hangUp } =
    useCall({ getCredential: getTestCredential });

  useEffect(() => {
    if (localVideoRef.current) localVideoRef.current.srcObject = localStream;
  }, [localStream]);

  useEffect(() => {
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = remoteStream;
  }, [remoteStream]);

  useEffect(() => {
    // Delay startup so React StrictMode's development cleanup cancels the first run.
    const timer = setTimeout(() => {
      if (sessionStorage.getItem("snapkyc-active") !== "1") return;
      const savedRoom = sessionStorage.getItem("snapkyc-room");
      const savedRole = sessionStorage.getItem("snapkyc-role");
      if (!savedRoom || (savedRole !== "agent" && savedRole !== "customer"))
        return;
      setRoomId(savedRoom);
      setRole(savedRole);
      startCall(savedRoom, savedRole);
    }, 0);
    return () => clearTimeout(timer);
  }, [startCall]);

  return (
    <main>
      <div className="flex flex-wrap gap-2">
        <video
          ref={localVideoRef}
          autoPlay
          playsInline
          muted
          className="w-full max-w-md"
        />
        <video
          ref={remoteVideoRef}
          autoPlay
          playsInline
          className="w-full max-w-md"
        />
      </div>
      <p>
        Call: {status} {error && `— ${error}`}
      </p>
      <input
        aria-label="Room ID"
        value={roomId}
        onChange={(e) => setRoomId(e.target.value)}
        disabled={status !== "idle" && status !== "error"}
      />
      <select
        value={role}
        onChange={(e) => setRole(e.target.value as Role)}
        disabled={status !== "idle" && status !== "error"}
      >
        <option value="agent">Agent</option>
        <option value="customer">Customer</option>
      </select>
      {status === "idle" || status === "error" ? (
        <button
          onClick={() => {
            hangUp();
            startCall(roomId, role);
          }}
        >
          Join Room
        </button>
      ) : (
        <button onClick={hangUp}>Leave Room</button>
      )}
      {status === "failed" && (
        <button
          onClick={() => {
            hangUp();
            startCall(roomId, role);
          }}
        >
          Retry
        </button>
      )}
      {status === "connected" && (
        <button
          onClick={() =>
            void remoteVideoRef.current?.play().catch(console.error)
          }
        >
          Enable sound
        </button>
      )}
    </main>
  );
}

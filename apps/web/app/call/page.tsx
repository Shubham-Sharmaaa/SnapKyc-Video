"use client";
import { useEffect, useRef, useState } from "react";
import {
  connectSignaling,
  createPeerConnection,
  startMedia,
  stopMedia,
} from "../lib/webrtc/callClient";
import type { Role } from "@repo/types";
export default function Page() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const joiningRef = useRef(false);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const pendingCandidatesRef = useRef<RTCIceCandidateInit[]>([]);
  const sendingOfferRef = useRef(false);
  const answeringRef = useRef(false);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const generationRef = useRef(0);
  const [role, setRole] = useState<"agent" | "customer">("agent");
  const [hasSocket, setHasSocket] = useState(false);
  async function startVideo() {
    try {
      if (streamRef.current) return;
      const stream = await startMedia();
      streamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
    } catch (error) {
      console.error("Camera access failed:", error);
      alert("Unable to access camera or microphone");
    }
  }
  function stopVideo() {
    if (streamRef.current) {
      stopMedia(streamRef.current);
      streamRef.current = null;
    }
    if (videoRef.current) videoRef.current.srcObject = null;
  }
  async function joinRoom(joinRole: Role = role) {
    if (joiningRef.current) return;
    const generation = generationRef.current;

    if (!streamRef.current) {
      const stream = await startMedia();

      if (generation !== generationRef.current) {
        stopMedia(stream);
        return;
      }

      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    }
    if (
      wsRef.current?.readyState === WebSocket.OPEN ||
      wsRef.current?.readyState === WebSocket.CONNECTING
    )
      return;
    joiningRef.current = true;
    try {
      const socket = await connectSignaling("test-room", joinRole);
      let retryAfterClose = false;
      if (generation !== generationRef.current) {
        socket?.close();
        return;
      }
      if (socket) {
        wsRef.current = socket;
        setHasSocket(true);

        socket.addEventListener("message", async (e) => {
          const data = JSON.parse(e.data);

          try {
            if (data.type === "error") {
              if (
                data.message === "Role already exists in room" ||
                data.message === "Room is full"
              ) {
                console.log("Role occupied. Closing and retrying...");
                retryAfterClose = true;
                socket.close();
                return;
              }

              console.error("Signaling error:", data.message);
              return;
            }

            if (data.type === "member-left") {
              resetPeerConnection();
              return;
            }

            if (data.type === "peer-joined") {
              resetPeerConnection();

              if (joinRole === "agent") {
                await sendOffer();
              }
              return;
            }

            if (data.type !== "room-message") return;

            if (data.message.kind === "ice-candidate") {
              await handleIceCandidate(data.message.candidate);
            }

            if (data.message.kind === "offer" && joinRole === "customer") {
              await handleOffer(data.message.description);
            }

            if (data.message.kind === "answer" && joinRole === "agent") {
              await pcRef.current?.setRemoteDescription(
                data.message.description,
              );

              await flushIceCandidates();
            }
          } catch (error) {
            console.error("WebRTC negotiation failed:", error);
          }
        });

        socket.addEventListener("close", () => {
          if (wsRef.current !== socket) return;

          wsRef.current = null;
          setHasSocket(false);

          if (
            retryAfterClose &&
            sessionStorage.getItem("snapkyc-active") === "1" &&
            generationRef.current === generation
          ) {
            retryTimerRef.current = setTimeout(() => {
              retryTimerRef.current = null;
              console.log("Retrying room join...");
              void joinRoom(joinRole);
            }, 4000);
          }
        });
      }
    } catch (err) {
      console.error("Failed To join: ", err);
    } finally {
      joiningRef.current = false;
    }
  }

  function leaveRoom() {
    sessionStorage.removeItem("snapkyc-active");

    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
    resetPeerConnection();

    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "leave-room" }));
    }

    wsRef.current?.close();
    wsRef.current = null;

    setHasSocket(false);
    stopVideo();
  }
  function preparePeerConnection() {
    if (!streamRef.current) return;
    if (pcRef.current) return;
    const pc = createPeerConnection(streamRef.current);
    pcRef.current = pc;
    pc.ontrack = (event) => {
      const remoteStream = event.streams[0];
      if (remoteVideoRef.current && remoteStream) {
        remoteVideoRef.current.srcObject = remoteStream;
      }
    };
    pc.onicecandidate = (event) => {
      if (!event.candidate) return;
      const ws = wsRef.current;
      if (ws?.readyState === WebSocket.OPEN) {
        ws.send(
          JSON.stringify({
            type: "room-message",
            message: {
              kind: "ice-candidate",
              candidate: event.candidate.toJSON(),
            },
          }),
        );
      }
    };

    pc.onconnectionstatechange = () => {
      console.log("WebRTC connection:", pc.connectionState);
    };
  }

  async function sendOffer() {
    if (sendingOfferRef.current) return;
    sendingOfferRef.current = true;

    try {
      preparePeerConnection();

      const pc = pcRef.current;
      const ws = wsRef.current;

      if (
        !pc ||
        !ws ||
        ws.readyState !== WebSocket.OPEN ||
        pc.signalingState !== "stable"
      )
        return;

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      if (!offer.sdp) return;

      ws.send(
        JSON.stringify({
          type: "room-message",
          message: {
            kind: "offer",
            description: {
              type: "offer",
              sdp: offer.sdp,
            },
          },
        }),
      );
    } finally {
      sendingOfferRef.current = false;
    }
  }

  async function handleOffer(description: RTCSessionDescriptionInit) {
    if (answeringRef.current) return;
    answeringRef.current = true;

    try {
      preparePeerConnection();

      const pc = pcRef.current;
      const ws = wsRef.current;

      if (!pc || !ws || ws.readyState !== WebSocket.OPEN) return;

      // Ignore an offer that was already answered.
      if (
        pc.remoteDescription?.type === "offer" &&
        pc.remoteDescription.sdp === description.sdp
      )
        return;

      if (pc.signalingState !== "stable") return;

      await pc.setRemoteDescription(description);
      await flushIceCandidates();

      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      ws.send(
        JSON.stringify({
          type: "room-message",
          message: {
            kind: "answer",
            description: {
              type: "answer",
              sdp: answer.sdp,
            },
          },
        }),
      );
    } finally {
      answeringRef.current = false;
    }
  }

  async function handleIceCandidate(candidate: RTCIceCandidateInit) {
    const pc = pcRef.current;

    if (!pc || !pc.remoteDescription) {
      pendingCandidatesRef.current.push(candidate);
      return;
    }

    await pc.addIceCandidate(candidate);
  }

  async function flushIceCandidates() {
    const pc = pcRef.current;
    if (!pc?.remoteDescription) return;

    const candidates = pendingCandidatesRef.current.splice(0);

    for (const candidate of candidates) {
      await pc.addIceCandidate(candidate);
    }
  }
  function resetPeerConnection() {
    pcRef.current?.close();
    pcRef.current = null;
    pendingCandidatesRef.current = [];

    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = null;
    }
  }

  useEffect(() => {
    const savedRole = sessionStorage.getItem("snapkyc-role");
    const shouldRejoin = sessionStorage.getItem("snapkyc-active") === "1";

    const timer = setTimeout(() => {
      if (shouldRejoin && (savedRole === "agent" || savedRole === "customer")) {
        setRole(savedRole);
        void joinRoom(savedRole);
      }
    }, 0);

    return () => {
      generationRef.current++;
      clearTimeout(timer);

      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current);
      }

      wsRef.current?.close();
      wsRef.current = null;

      pcRef.current?.close();
      pcRef.current = null;

      pendingCandidatesRef.current = [];

      if (streamRef.current) {
        stopMedia(streamRef.current);
        streamRef.current = null;
      }
    };
  }, []);

  return (
    <div className="flex flex-col">
      <div className="flex ">
        <video ref={videoRef} autoPlay playsInline muted />
        <video ref={remoteVideoRef} autoPlay playsInline />
      </div>
      <div>
        <button onClick={startVideo}>Play</button>
        <button onClick={stopVideo}>Stop</button>
      </div>
      <div>
        <select value={role} onChange={(e) => setRole(e.target.value as Role)}>
          <option value="agent">Agent</option>
          <option value="customer">Customer</option>
        </select>
        <button
          onClick={() => {
            sessionStorage.setItem("snapkyc-role", role);
            sessionStorage.setItem("snapkyc-active", "1");
            void joinRoom(role);
          }}
        >
          Join Room
        </button>
        {hasSocket && <button onClick={leaveRoom}>Leave Room</button>}
      </div>
    </div>
  );
}

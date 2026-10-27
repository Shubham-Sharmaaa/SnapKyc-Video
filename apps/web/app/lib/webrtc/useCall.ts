"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Role } from "@repo/types";
import {
  connectSignaling,
  createPeerConnection,
  startMedia,
  stopMedia,
} from "./callClient";

type CallStatus =
  | "idle"
  | "joining"
  | "waiting"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "failed"
  | "error";

type CallOptions = {
  getCredential: (roomId: string, role: Role) => Promise<string>;
  getIceServers?: () => Promise<RTCIceServer[]>;
};

const defaultIceServers: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
];

export function useCall({ getCredential, getIceServers }: CallOptions) {
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [status, setStatus] = useState<CallStatus>("idle");
  const [error, setError] = useState("");

  const streamRef = useRef<MediaStream | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const pendingCandidatesRef = useRef<RTCIceCandidateInit[]>([]);
  const iceServersRef = useRef<RTCIceServer[]>(defaultIceServers);
  const joiningRef = useRef(false);
  const sendingOfferRef = useRef(false);
  const answeringRef = useRef(false);
  const activeRef = useRef(false);
  const generationRef = useRef(0);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const resetPeer = useCallback(() => {
    pcRef.current?.close();
    pcRef.current = null;
    pendingCandidatesRef.current = [];
    setRemoteStream(null);
  }, []);

  const preparePeer = useCallback(() => {
    if (pcRef.current) return pcRef.current;
    if (!streamRef.current) return null;

    const pc = createPeerConnection(streamRef.current, iceServersRef.current);
    pcRef.current = pc;

    pc.ontrack = (event) => {
      if (pcRef.current === pc) {
        setRemoteStream(event.streams[0] ?? new MediaStream([event.track]));
      }
    };

    pc.onicecandidate = (event) => {
      if (!event.candidate || pcRef.current !== pc) return;
      const socket = wsRef.current;
      if (socket?.readyState === WebSocket.OPEN) {
        socket.send(
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
      if (pcRef.current !== pc) return;
      if (pc.connectionState === "connected") setStatus("connected");
      if (pc.connectionState === "connecting") setStatus("connecting");
      if (pc.connectionState === "disconnected") setStatus("reconnecting");
      if (pc.connectionState === "failed") setStatus("failed");
    };

    return pc;
  }, []);

  const flushCandidates = useCallback(async () => {
    const pc = pcRef.current;
    if (!pc?.remoteDescription) return;
    const candidates = pendingCandidatesRef.current.splice(0);
    for (const candidate of candidates) {
      if (pcRef.current !== pc) return;
      await pc.addIceCandidate(candidate);
    }
  }, []);

  const handleCandidate = useCallback(
    async (candidate: RTCIceCandidateInit) => {
      const pc = pcRef.current;
      if (!pc?.remoteDescription) {
        pendingCandidatesRef.current.push(candidate);
        return;
      }
      await pc.addIceCandidate(candidate);
    },
    [],
  );

  const sendOffer = useCallback(async () => {
    if (sendingOfferRef.current) return;
    sendingOfferRef.current = true;
    try {
      const pc = preparePeer();
      const socket = wsRef.current;
      if (
        !pc ||
        !socket ||
        socket.readyState !== WebSocket.OPEN ||
        pc.signalingState !== "stable"
      )
        return;

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      if (pcRef.current !== pc || !offer.sdp) return;

      socket.send(
        JSON.stringify({
          type: "room-message",
          message: {
            kind: "offer",
            description: { type: "offer", sdp: offer.sdp },
          },
        }),
      );
    } finally {
      sendingOfferRef.current = false;
    }
  }, [preparePeer]);

  const handleOffer = useCallback(
    async (description: RTCSessionDescriptionInit) => {
      if (answeringRef.current) return;
      answeringRef.current = true;
      try {
        const pc = preparePeer();
        const socket = wsRef.current;
        if (
          !pc ||
          !socket ||
          socket.readyState !== WebSocket.OPEN ||
          pc.signalingState !== "stable"
        )
          return;

        await pc.setRemoteDescription(description);
        await flushCandidates();
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        if (pcRef.current !== pc || !answer.sdp) return;

        socket.send(
          JSON.stringify({
            type: "room-message",
            message: {
              kind: "answer",
              description: { type: "answer", sdp: answer.sdp },
            },
          }),
        );
      } finally {
        answeringRef.current = false;
      }
    },
    [preparePeer, flushCandidates],
  );

  const attemptJoin = useCallback(
    async function attemptJoin(
      roomId: string,
      role: Role,
      generation: number,
    ): Promise<void> {
      if (
        joiningRef.current ||
        !activeRef.current ||
        generation !== generationRef.current
      )
        return;

      joiningRef.current = true; // Before the first await: prevents double camera requests.
      setStatus("joining");

      try {
        if (!streamRef.current) {
          const stream = await startMedia();
          if (!activeRef.current || generation !== generationRef.current) {
            stopMedia(stream); // Permission arrived after Hang Up.
            return;
          }
          streamRef.current = stream;
          setLocalStream(stream);
        }

        const servers = getIceServers
          ? await getIceServers()
          : defaultIceServers;
        if (!activeRef.current || generation !== generationRef.current) return;
        iceServersRef.current = servers;

        const socket = await connectSignaling(roomId, role, getCredential);
        if (!activeRef.current || generation !== generationRef.current) {
          socket.close();
          return;
        }
        wsRef.current = socket;

        socket.addEventListener("open", () => {
          if (!activeRef.current || generation !== generationRef.current) {
            socket.close();
            return;
          }
          setStatus("waiting");
        });

        socket.addEventListener("message", async (event) => {
          if (
            !activeRef.current ||
            generation !== generationRef.current ||
            wsRef.current !== socket
          )
            return;

          try {
            const data = JSON.parse(event.data);

            if (data.type === "error") {
              if (
                data.message === "Role already exists in room" ||
                data.message === "Room is full"
              ) {
                socket.close(); // The close listener will retry in 4 seconds.
              } else {
                setError(data.message ?? "Signaling error");
                setStatus("error");
                activeRef.current = false;
                sessionStorage.removeItem("snapkyc-active");
                socket.close();
                if (streamRef.current) stopMedia(streamRef.current);
                streamRef.current = null;
                setLocalStream(null);
              }
              return;
            }

            if (data.type === "member-left") {
              resetPeer();
              setStatus("waiting");
              return;
            }

            if (data.type === "peer-joined") {
              resetPeer();
              setStatus("connecting");
              if (role === "agent") await sendOffer();
              return;
            }

            if (data.type !== "room-message") return;
            if (data.message.kind === "ice-candidate") {
              await handleCandidate(data.message.candidate);
            } else if (data.message.kind === "offer" && role === "customer") {
              await handleOffer(data.message.description);
            } else if (data.message.kind === "answer" && role === "agent") {
              const pc = pcRef.current;
              if (pc?.signalingState === "have-local-offer") {
                await pc.setRemoteDescription(data.message.description);
                await flushCandidates();
              }
            }
          } catch (err) {
            console.error("WebRTC signaling failed:", err);
            setError("WebRTC negotiation failed");
            setStatus("failed");
          }
        });

        socket.addEventListener("error", () => {
          console.error("WebSocket connection error");
          socket.close();
        });

        socket.addEventListener("close", () => {
          if (wsRef.current !== socket) return;
          wsRef.current = null;
          resetPeer();

          if (activeRef.current && generation === generationRef.current) {
            setStatus("reconnecting");
            retryTimerRef.current = setTimeout(() => {
              retryTimerRef.current = null;
              void attemptJoin(roomId, role, generation);
            }, 4000);
          }
        });
      } catch (err) {
        if (activeRef.current && generation === generationRef.current) {
          setError(err instanceof Error ? err.message : "Could not join call");
          setStatus("error");
          activeRef.current = false;
          sessionStorage.removeItem("snapkyc-active");
          if (streamRef.current) stopMedia(streamRef.current);
          streamRef.current = null;
          setLocalStream(null);
        }
      } finally {
        joiningRef.current = false;
      }
    },
    [
      getCredential,
      getIceServers,
      resetPeer,
      sendOffer,
      handleOffer,
      handleCandidate,
      flushCandidates,
    ],
  );

  const startCall = useCallback(
    (roomId: string, role: Role) => {
      if (activeRef.current || joiningRef.current) return;
      activeRef.current = true;
      setError("");
      sessionStorage.setItem("snapkyc-room", roomId);
      sessionStorage.setItem("snapkyc-role", role);
      sessionStorage.setItem("snapkyc-active", "1");
      void attemptJoin(roomId, role, generationRef.current);
    },
    [attemptJoin],
  );

  const hangUp = useCallback(() => {
    generationRef.current++;
    activeRef.current = false;
    sessionStorage.removeItem("snapkyc-active");
    if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    retryTimerRef.current = null;

    const socket = wsRef.current;
    wsRef.current = null;
    if (socket?.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: "leave-room" }));
    }
    socket?.close();
    resetPeer();

    if (streamRef.current) stopMedia(streamRef.current);
    streamRef.current = null;
    setLocalStream(null);
    setStatus("idle");
    setError("");
  }, [resetPeer]);

  useEffect(() => {
    return () => {
      // Important: do not clear sessionStorage here; a refresh should rejoin.
      generationRef.current++;
      activeRef.current = false;
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
      wsRef.current?.close();
      wsRef.current = null;
      pcRef.current?.close();
      pcRef.current = null;
      if (streamRef.current) stopMedia(streamRef.current);
      streamRef.current = null;
    };
  }, []);

  return { localStream, remoteStream, status, error, startCall, hangUp };
}

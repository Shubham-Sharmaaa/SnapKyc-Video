"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import type { Role } from "@repo/types";
import {
  connectionRoute,
  connectSignaling,
  createPeerConnection,
  REPLACED_CLOSE_CODE,
  relayOnly,
  startMedia,
  stopMedia,
  type CallRoute,
} from "./callClient";

export type { CallRoute };

export type CallStatus =
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

const noSubscription = () => () => {};

// Most calls connect in a few seconds, even through TURN.
const CONNECT_TIMEOUT_MS = 25_000;
// Hosted WebSockets drop now and then (Render cuts idle-looking ones).
const RECONNECT_DELAY_MS = 2_000;

export function useCall({ getCredential, getIceServers }: CallOptions) {
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [status, setStatus] = useState<CallStatus>("idle");
  const [error, setError] = useState("");
  const [micEnabled, setMicEnabled] = useState(true);
  const [cameraEnabled, setCameraEnabled] = useState(true);
  const [route, setRoute] = useState<CallRoute | null>(null);
  // Read from the URL on the client only, so server and client HTML match.
  const relayOnlyMode = useSyncExternalStore(noSubscription, relayOnly, () => false);
  const lastJoinRef = useRef<{ roomId: string; role: Role } | null>(null);

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
    setRoute(null);
  }, []);

  const preparePeer = useCallback(() => {
    if (pcRef.current) return pcRef.current;
    if (!streamRef.current) return null;

    const pc = createPeerConnection(streamRef.current, iceServersRef.current);
    pcRef.current = pc;

    // Browsers normally supply event.streams[0], but streamless tracks are
    // valid too. Reuse one fallback stream so audio and video are not lost.
    const fallbackRemoteStream = new MediaStream();
    pc.ontrack = (event) => {
      if (pcRef.current !== pc) return;
      if (event.streams[0]) {
        setRemoteStream(event.streams[0]);
        return;
      }
      if (!fallbackRemoteStream.getTracks().includes(event.track)) {
        fallbackRemoteStream.addTrack(event.track);
      }
      setRemoteStream(fallbackRemoteStream);
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
      if (pc.connectionState === "connected") {
        setStatus("connected");
        void connectionRoute(pc)
          .then((r) => {
            if (pcRef.current === pc) setRoute(r);
          })
          .catch(() => {});
      }
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
        // Every offer comes from a new agent connection. If we kept an old
        // one through a signaling drop, it can't take the new offer.
        if (pcRef.current?.remoteDescription) resetPeer();
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
      // Only the first join starts the camera; a signaling rejoin keeps the
      // current status (often still "connected").
      if (!streamRef.current) setStatus("joining");

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

        const socket = await connectSignaling(
          roomId,
          role,
          getCredential,
          () => pcRef.current?.connectionState === "connected",
        );
        if (!activeRef.current || generation !== generationRef.current) {
          socket.close();
          return;
        }
        wsRef.current = socket;
        let opened = false;

        // The same person joined from another tab or device; that one keeps
        // the call, so stop here instead of reconnecting and fighting over it.
        const stopAsReplaced = () => {
          setError("This call was opened on another tab or device.");
          setStatus("error");
          activeRef.current = false;
          sessionStorage.removeItem("snapkyc-active");
          wsRef.current = null;
          socket.close();
          resetPeer();
          if (streamRef.current) stopMedia(streamRef.current);
          streamRef.current = null;
          setLocalStream(null);
        };

        socket.addEventListener("open", () => {
          if (!activeRef.current || generation !== generationRef.current) {
            socket.close();
            return;
          }
          opened = true;
          setError("");
          if (pcRef.current?.connectionState !== "connected") setStatus("waiting");
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

            if (data.type === "replaced") {
              stopAsReplaced();
              return;
            }

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
              // Only their socket dropped: their video may still be up and
              // they rejoin within seconds, so keep the call running.
              if (
                data.reason === "disconnected" &&
                pcRef.current?.connectionState === "connected"
              ) {
                return;
              }
              resetPeer();
              setStatus("waiting");
              return;
            }

            if (data.type === "peer-joined") {
              // The joiner kept its video connection and ours is up too:
              // nothing to renegotiate, the call carries on.
              if (
                data.resume === true &&
                pcRef.current?.connectionState === "connected"
              ) {
                return;
              }
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

        socket.addEventListener("close", (event) => {
          if (wsRef.current !== socket) return;
          wsRef.current = null;
          if (!activeRef.current || generation !== generationRef.current) return;

          if (event.code === REPLACED_CLOSE_CODE) {
            stopAsReplaced();
            return;
          }

          // Video flows peer-to-peer, not through the signal server, so a
          // dropped socket doesn't end a live call: reconnect in the background.
          if (pcRef.current?.connectionState !== "connected") {
            resetPeer();
            setStatus("reconnecting");
          }
          if (!opened) {
            setError("Can't reach the call server. If it was asleep, it can take up to a minute to wake.");
          }
          retryTimerRef.current = setTimeout(() => {
            retryTimerRef.current = null;
            void attemptJoin(roomId, role, generation);
          }, RECONNECT_DELAY_MS);
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
      lastJoinRef.current = { roomId, role };
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
    setMicEnabled(true);
    setCameraEnabled(true);
    setLocalStream(null);
    setStatus("idle");
    setError("");
  }, [resetPeer]);

  // Start over in the same room after a failed connection or join error.
  const retry = useCallback(() => {
    const last = lastJoinRef.current;
    if (!last) return;
    hangUp();
    startCall(last.roomId, last.role);
  }, [hangUp, startCall]);

  // startCall keeps the room in sessionStorage until Hang Up, so after a page
  // refresh (or a phone reloading the tab) the user goes straight back in.
  const rejoinAfterRefresh = useCallback(
    (roomId: string, role: Role) => {
      if (
        sessionStorage.getItem("snapkyc-active") === "1" &&
        sessionStorage.getItem("snapkyc-room") === roomId &&
        sessionStorage.getItem("snapkyc-role") === role
      ) {
        startCall(roomId, role);
      }
    },
    [startCall],
  );

  // When no route exists at all (e.g. a network that blocks TURN), ICE can sit
  // in "connecting" forever instead of failing. Give up so the user sees the
  // failure and a Retry button; a late connection still moves to "connected".
  useEffect(() => {
    if (status !== "connecting") return;
    const timer = setTimeout(
      () => setStatus((s) => (s === "connecting" ? "failed" : s)),
      CONNECT_TIMEOUT_MS,
    );
    return () => clearTimeout(timer);
  }, [status]);

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

  const toggleMic = useCallback(() => {
    const track = streamRef.current?.getAudioTracks()[0];
    if (!track) return;

    track.enabled = !track.enabled;
    setMicEnabled(track.enabled);
  }, []);

  const toggleCamera = useCallback(() => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;

    track.enabled = !track.enabled;
    setCameraEnabled(track.enabled);
  }, []);

  return {
    localStream,
    remoteStream,
    status,
    error,
    startCall,
    hangUp,
    retry,
    rejoinAfterRefresh,
    toggleMic,
    toggleCamera,
    micEnabled,
    cameraEnabled,
    route,
    relayOnly: relayOnlyMode,
  };
}

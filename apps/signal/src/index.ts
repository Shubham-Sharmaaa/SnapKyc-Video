import express from "express";
import dotenv from "dotenv";
import { WebSocket, WebSocketServer } from "ws";
import type { Role, SignalingPayload } from "@repo/types";
import jwt from "jsonwebtoken";
dotenv.config();
const app = express();
const PORT = process.env.PORT || 8080;
const secret = process.env.SIGNAL_SECRET;
if (!secret) throw new Error("SIGNAL_SECRET is not configured");
app.get("/health", (req, res) => {
  res.status(200).json({ message: "Hello from the health route!" });
});
app.use((req, res) => {
  res.status(404).json({ message: "Route not found" });
});

const server = app.listen(PORT, () => {
  console.log(`Signal server is running on port ${PORT}`);
});

const wss = new WebSocketServer({ server, maxPayload: 128 * 1024 });
// Pings without a pong; a socket is cut after MAX_MISSED_PONGS in a row.
const missedPongs = new WeakMap<WebSocket, number>();
const MAX_MISSED_PONGS = 2;
// Sent to a socket replaced by a newer join for the same role, so that
// client knows not to reconnect (see "join-room").
const REPLACED_CLOSE_CODE = 4001;
type WebSocketRoomMember = {
  ws: WebSocket;
  role: Role;
};

function isValidRoomId(roomId: unknown): roomId is string {
  return (
    !!roomId &&
    typeof roomId === "string" &&
    roomId.trim() !== "" &&
    roomId.length <= 100 &&
    !roomId.includes(" ") &&
    !roomId.includes("\n") &&
    !roomId.includes("\t") &&
    !roomId.includes("\r")
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseSignalingPayload(message: unknown): SignalingPayload | null {
  if (!isRecord(message)) return null;

  // SDP offer and answer
  if (message.kind === "offer" || message.kind === "answer") {
    const description = message.description;

    if (
      !isRecord(description) ||
      description.type !== message.kind ||
      typeof description.sdp !== "string" ||
      description.sdp.trim().length === 0 ||
      description.sdp.length > 64 * 1024
    ) {
      return null;
    }

    if (message.kind === "offer") {
      return {
        kind: "offer",
        description: {
          type: "offer",
          sdp: description.sdp,
        },
      };
    }

    return {
      kind: "answer",
      description: {
        type: "answer",
        sdp: description.sdp,
      },
    };
  }

  // ICE candidate
  if (message.kind === "ice-candidate") {
    if (!isRecord(message.candidate)) return null;

    const { candidate, sdpMid, sdpMLineIndex, usernameFragment } =
      message.candidate;

    if (typeof candidate !== "string" || candidate.length > 8192) {
      return null;
    }

    if (
      sdpMid != null &&
      (typeof sdpMid !== "string" || sdpMid.length > 100)
    ) {
      return null;
    }

    if (
      sdpMLineIndex != null &&
      (typeof sdpMLineIndex !== "number" ||
        !Number.isInteger(sdpMLineIndex) ||
        sdpMLineIndex < 0)
    ) {
      return null;
    }

    if (
      usernameFragment !== undefined &&
      usernameFragment !== null &&
      (typeof usernameFragment !== "string" || usernameFragment.length > 256)
    ) {
      return null;
    }

    // Normal candidates require a media section identifier.
    if (candidate !== "" && sdpMid == null && sdpMLineIndex == null) {
      return null;
    }

    return {
      kind: "ice-candidate",
      candidate: {
        candidate,
        sdpMid: sdpMid ?? null,
        sdpMLineIndex: sdpMLineIndex ?? null,
        ...(usernameFragment !== undefined ? { usernameFragment } : {}),
      },
    };
  }

  return null;
}

let rooms_map = new Map<string, WebSocketRoomMember[]>();
const socketRooms = new Map<WebSocket, string>();
wss.on("connection", (ws: WebSocket, req) => {
  console.log("client connected from", req.socket.remoteAddress);
  missedPongs.set(ws, 0);
  ws.on("pong", () => {
    missedPongs.set(ws, 0);
  });
  ws.on("message", (data) => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(data.toString());
    } catch {
      ws.send(
        JSON.stringify({
          type: "error",
          message: "Invalid JSON",
        }),
      );
      return;
    }
    if (!isRecord(parsed)) {
      ws.send(
        JSON.stringify({
          type: "error",
          message: "Invalid message format",
        }),
      );
      return;
    }
    const dataObj = parsed;

    switch (dataObj.type) {
      case "join-room":
        if (
          typeof dataObj.token !== "string" ||
          dataObj.token.length === 0 ||
          dataObj.token.length > 4096
        ) {
          return ws.send(
            JSON.stringify({
              type: "error",
              message: "Invalid room credentials",
            }),
          );
        }
        const token = dataObj.token;
        let verifyToken;
        try {
          verifyToken = jwt.verify(token, secret, {
            algorithms: ["HS256"],
          });
        } catch (err) {
          return ws.send(
            JSON.stringify({
              type: "error",
              message: "Invalid or expired room credential",
            }),
          );
        }
        if (
          typeof verifyToken !== "object" ||
          verifyToken === null ||
          typeof verifyToken.exp !== "number"
        ) {
          return ws.send(
            JSON.stringify({
              type: "error",
              message: "Invalid or expired room credential",
            }),
          );
        }
        const { role, roomId } = verifyToken;
        if (!isValidRoomId(roomId)) {
          return ws.send(
            JSON.stringify({ type: "error", message: "Invalid room ID" }),
          );
        }

        if (role !== "agent" && role !== "customer") {
          return ws.send(
            JSON.stringify({ type: "error", message: "Invalid role" }),
          );
        }
        if (socketRooms.has(ws)) {
          return ws.send(
            JSON.stringify({
              type: "error",
              message: "Already joined a room",
            }),
          );
        }
        const joinRoom = rooms_map.get(roomId) ?? [];
        // One socket per role. A newer join replaces the old one: it is
        // usually the same person whose connection dropped before the server
        // noticed. The old socket gets a close code the client won't retry.
        const previous = joinRoom.find((client) => client.role === role);
        if (previous) {
          joinRoom.splice(joinRoom.indexOf(previous), 1);
          socketRooms.delete(previous.ws);
          previous.ws.close(REPLACED_CLOSE_CODE, "Replaced by a newer connection");
        }
        joinRoom.push({ ws, role });
        rooms_map.set(roomId, joinRoom);
        socketRooms.set(ws, roomId);
        if (joinRoom.length === 2) {
          // resume: the joiner still has a live video connection, so the
          // agent can keep it instead of renegotiating.
          const resume = dataObj.resume === true;
          joinRoom.forEach((client) => {
            client.ws.send(
              JSON.stringify({
                type: "peer-joined",
                role: client.role === "agent" ? "customer" : "agent",
                resume,
              }),
            );
          });
        }
        break;
      case "room-message":
        const roomIdForMessage = socketRooms.get(ws);

        if (!roomIdForMessage || !isValidRoomId(roomIdForMessage)) {
          return ws.send(
            JSON.stringify({ type: "error", message: "Invalid room ID" }),
          );
        }
        const room = rooms_map.get(roomIdForMessage);
        if (!room) {
          return ws.send(
            JSON.stringify({
              type: "error",
              message: "Room does not exist",
            }),
          );
        }
        const isMember = room.some((client) => client.ws === ws);
        if (!isMember) {
          return ws.send(
            JSON.stringify({
              type: "error",
              message: "Not a member of the room",
            }),
          );
        }
        const payload = parseSignalingPayload(dataObj.message);
        if (!payload) {
          return ws.send(
            JSON.stringify({
              type: "error",
              message: "Invalid signaling payload",
            }),
          );
        }
        room.forEach((client) => {
          if (client.ws !== ws && client.ws.readyState === WebSocket.OPEN) {
            client.ws.send(
              JSON.stringify({
                type: "room-message",
                message: payload,
              }),
            );
          }
        });
        break;
      case "leave-room":
        // const roomIdToLeave = dataObj.roomId;
        const roomIdToLeave = socketRooms.get(ws);
        if (!roomIdToLeave || !isValidRoomId(roomIdToLeave)) {
          return ws.send(
            JSON.stringify({ type: "error", message: "Invalid room ID" }),
          );
        }
        const roomToLeave = rooms_map.get(roomIdToLeave);
        if (!roomToLeave) {
          return ws.send(
            JSON.stringify({ type: "error", message: "Room does not exist" }),
          );
        }
        const memberIndex = roomToLeave.findIndex((client) => client.ws === ws);
        if (memberIndex !== -1) {
          roomToLeave.splice(memberIndex, 1);
          socketRooms.delete(ws);
          if (roomToLeave.length === 0) {
            rooms_map.delete(roomIdToLeave);
          } else {
            roomToLeave.forEach((client) => {
              if (client.ws.readyState === WebSocket.OPEN) {
                client.ws.send(
                  JSON.stringify({
                    type: "member-left",
                    reason: "left",
                    message: "A member has left the room",
                  }),
                );
              }
            });
          }
        } else {
          return ws.send(
            JSON.stringify({
              type: "error",
              message: "Not a member of the room",
            }),
          );
        }
        break;
      default:
        return ws.send(
          JSON.stringify({ type: "error", message: "Unknown message type" }),
        );
    }
  });
  ws.on("error", (err) => console.error("WebSocket error:", err));

  ws.on("close", () => {
    const roomId = socketRooms.get(ws);
    if (!roomId) return;
    socketRooms.delete(ws);
    const room = rooms_map.get(roomId!);
    if (!room) return;
    const memberIndex = room.findIndex((client) => client.ws === ws);
    if (memberIndex !== -1) {
      room.splice(memberIndex, 1);
      if (room.length === 0) {
        rooms_map.delete(roomId);
      } else {
        // Their socket dropped; their video connection may still be up and
        // they will usually rejoin within seconds.
        room.forEach((client) => {
          if (client.ws.readyState === WebSocket.OPEN) {
            client.ws.send(
              JSON.stringify({
                type: "member-left",
                reason: "disconnected",
                message: "A member has left the room",
              }),
            );
          }
        });
      }
    }
  });
});
const heartbeatInterval = setInterval(() => {
  wss.clients.forEach((ws) => {
    if (ws.readyState !== WebSocket.OPEN) return;
    // Tolerate one late pong: some proxies delay them.
    const missed = missedPongs.get(ws) ?? 0;
    if (missed >= MAX_MISSED_PONGS) {
      ws.terminate();
      return;
    }
    missedPongs.set(ws, missed + 1);
    ws.ping();
  });
}, 30_000);
wss.on("close", () => {
  clearInterval(heartbeatInterval);
});

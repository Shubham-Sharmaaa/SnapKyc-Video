import type { SignalingPayload } from "./messages.js";

// Sent to a socket replaced by a newer join for the same role (another tab or
// device), so that client knows not to reconnect.
export const REPLACED_CLOSE_CODE = 4001;

export function isValidRoomId(roomId: unknown): roomId is string {
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

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// The signal server relays only payloads that pass this check.
export function parseSignalingPayload(message: unknown): SignalingPayload | null {
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

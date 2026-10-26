export type Role = "agent" | "customer";

export type RoomMessage =
  | {
      type: "join-room";
      token: string;
    }
  | {
      type: "leave-room";
    }
  | {
      type: "room-message";
      message: SignalingPayload;
    };
export type SignalingPayload =
  | {
      kind: "offer";
      description: {
        type: "offer";
        sdp: string;
      };
    }
  | {
      kind: "answer";
      description: {
        type: "answer";
        sdp: string;
      };
    }
  | {
      kind: "ice-candidate";
      candidate: {
        candidate: string;
        sdpMid: string | null;
        sdpMLineIndex: number | null;
        usernameFragment?: string | null;
      };
    };

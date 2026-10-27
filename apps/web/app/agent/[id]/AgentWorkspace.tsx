"use client";

/* eslint-disable @next/next/no-img-element -- local data URL / signed URL */
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { VideoTile } from "../../_components/VideoTile";
import { wakeSignalServer } from "../../_utils/config";
import { getAgentCredential, getIceServers } from "../../lib/webrtc/credentials";
import { useCall } from "../../lib/webrtc/useCall";
import { useRecorder } from "../../lib/webrtc/useRecorder";

type Props = {
  sessionId: string;
  questions: string[];
  initialSnapshotUrl: string | null;
  initialRecordingSaved: boolean;
  children: ReactNode; // customer facts, rendered on the server
};

async function postJson(url: string, body: unknown) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "Request failed");
  return data;
}

function elapsed(since: number | null, now: number) {
  if (!since) return "00:00";
  const seconds = Math.max(0, Math.floor((now - since) / 1000));
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

export function AgentWorkspace({
  sessionId,
  questions,
  initialSnapshotUrl,
  initialRecordingSaved,
  children,
}: Props) {
  const router = useRouter();
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const [failedBlob, setFailedBlob] = useState<Blob | null>(null);

  const call = useCall({ getCredential: getAgentCredential, getIceServers });
  const recorder = useRecorder();

  const [snapshot, setSnapshot] = useState(initialSnapshotUrl);
  const [snapshotSaved, setSnapshotSaved] = useState(!!initialSnapshotUrl);
  const [snapshotBusy, setSnapshotBusy] = useState(false);
  const [recordingSaved, setRecordingSaved] = useState(initialRecordingSaved);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [now, setNow] = useState(() => Date.now());
  const [asked, setAsked] = useState<boolean[]>(() => questions.map(() => false));
  const [recommendation, setRecommendation] = useState<"approve" | "reject" | "">("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const inCall = call.status !== "idle" && call.status !== "error";

  useEffect(() => wakeSignalServer(), []);

  // V-CIP: the call is recorded. Start as soon as the customer is connected.
  const { start: startRecording, recording } = recorder;
  useEffect(() => {
    if (
      call.status === "connected" &&
      call.remoteStream &&
      !recording &&
      !recordingSaved &&
      !saving
    ) {
      startRecording(call.remoteStream, call.localStream);
    }
  }, [call.status, call.remoteStream, call.localStream, recording, recordingSaved, saving, startRecording]);

  useEffect(() => {
    if (!recording) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [recording]);

  async function uploadRecording(blob: Blob) {
    const contentType = blob.type || "video/webm";
    const { uploadUrl } = await postJson(`/api/sessions/${sessionId}/recording`, {
      action: "start",
      contentType,
    });
    const put = await fetch(uploadUrl, {
      method: "PUT",
      body: blob,
      headers: { "Content-Type": contentType, "x-upsert": "true" },
    });
    if (!put.ok) throw new Error(`Upload failed (${put.status})`);
    await postJson(`/api/sessions/${sessionId}/recording`, {
      action: "finish",
      contentType,
    });
  }

  async function saveRecording(blob: Blob) {
    setSaving(true);
    setMessage("Uploading recording…");
    try {
      await uploadRecording(blob);
      setFailedBlob(null);
      setRecordingSaved(true);
      setMessage("Recording saved.");
    } catch (err) {
      setFailedBlob(blob);
      setMessage(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setSaving(false);
    }
  }

  async function endCall() {
    setSaving(true);
    const blob = await recorder.stop();
    call.hangUp();
    if (blob) {
      await saveRecording(blob);
    } else {
      setSaving(false);
      if (!recordingSaved) {
        setMessage("Nothing was recorded. Join the call again to record it.");
      }
    }
  }

  async function takeSnapshot() {
    const video = remoteVideoRef.current;
    if (!video || !video.videoWidth) {
      setMessage("The customer's video is not showing yet.");
      return;
    }
    const scale = Math.min(1, 1280 / video.videoWidth);
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    canvas.getContext("2d")?.drawImage(video, 0, 0, canvas.width, canvas.height);
    const image = canvas.toDataURL("image/jpeg", 0.85);

    setSnapshot(image);
    setSnapshotBusy(true);
    try {
      await postJson(`/api/sessions/${sessionId}/snapshot`, { image });
      setSnapshotSaved(true);
      setMessage("Snapshot saved.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Snapshot failed");
    } finally {
      setSnapshotBusy(false);
    }
  }

  async function submitRecommendation(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await postJson(`/api/sessions/${sessionId}/recommendation`, {
        recommendation,
        notes,
      });
      router.push("/agent");
      router.refresh();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Could not submit");
      setSubmitting(false);
    }
  }

  const readyToRecommend = snapshotSaved && recordingSaved && !inCall;

  return (
    <div className="workspace">
      <section className="card">
        <div className="videos">
          <VideoTile
            stream={call.remoteStream}
            label="Customer"
            placeholder={inCall ? "Waiting for the customer…" : "Not in call"}
            videoRef={remoteVideoRef}
          />
          <VideoTile stream={call.localStream} label="You" muted small placeholder="Your camera" />
        </div>

        <p className="call-status">
          {recording && (
            <span className="rec">● REC {elapsed(recorder.startedAt, now)}</span>
          )}{" "}
          Call: {call.status}
          {call.error && <span className="error"> — {call.error}</span>}
        </p>

        <div className="row">
          {!inCall ? (
            <button
              className="btn btn-primary"
              disabled={saving}
              onClick={() => {
                setMessage("");
                call.startCall(sessionId, "agent");
              }}
            >
              {recordingSaved ? "Rejoin call" : "Join call"}
            </button>
          ) : (
            <>
              <button
                className="btn btn-primary"
                disabled={call.status !== "connected" || snapshotBusy}
                onClick={takeSnapshot}
              >
                {snapshotBusy ? "Saving…" : snapshotSaved ? "Retake snapshot" : "Take face snapshot"}
              </button>
              <button className="btn btn-ghost" onClick={call.toggleMic}>
                {call.micEnabled ? "Mute mic" : "Unmute mic"}
              </button>
              <button className="btn btn-ghost" onClick={call.toggleCamera}>
                {call.cameraEnabled ? "Camera off" : "Camera on"}
              </button>
              <button className="btn btn-danger" disabled={saving} onClick={endCall}>
                {recording ? "End call & save recording" : "Leave call"}
              </button>
            </>
          )}
          {failedBlob && !saving && (
            <button
              className="btn btn-ghost"
              onClick={() => saveRecording(failedBlob)}
            >
              Retry upload
            </button>
          )}
        </div>
        {message && <p className="muted">{message}</p>}

        <div className="checks">
          <span className={snapshotSaved ? "ok" : "muted"}>
            {snapshotSaved ? "✓" : "○"} Face snapshot
          </span>
          <span className={recordingSaved ? "ok" : "muted"}>
            {recordingSaved ? "✓" : "○"} Recording saved
          </span>
        </div>

        {snapshot && (
          <figure className="snapshot">
            <img src={snapshot} alt="Customer face snapshot" />
            <figcaption>Face snapshot</figcaption>
          </figure>
        )}
      </section>

      <div className="side">
        <section className="card">
          <h2>Customer</h2>
          {children}
        </section>

        <section className="card">
          <h2>Ask these questions</h2>
          <ul className="questions">
            {questions.map((question, i) => (
              <li key={question}>
                <label className="checkbox">
                  <input
                    type="checkbox"
                    checked={asked[i] ?? false}
                    onChange={(e) =>
                      setAsked((prev) => prev.map((v, j) => (j === i ? e.target.checked : v)))
                    }
                  />
                  <span>{question}</span>
                </label>
              </li>
            ))}
          </ul>
        </section>

        <section className="card">
          <h2>Your recommendation</h2>
          {!readyToRecommend && (
            <p className="muted small">
              Take a snapshot, then end the call so the recording is saved.
            </p>
          )}
          <form onSubmit={submitRecommendation} className="form">
            <div className="row">
              <label className="radio">
                <input
                  type="radio"
                  name="recommendation"
                  checked={recommendation === "approve"}
                  onChange={() => setRecommendation("approve")}
                />
                Recommend approve
              </label>
              <label className="radio">
                <input
                  type="radio"
                  name="recommendation"
                  checked={recommendation === "reject"}
                  onChange={() => setRecommendation("reject")}
                />
                Recommend reject
              </label>
            </div>
            <label className="field">
              <span>Notes for the reviewer</span>
              <textarea
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="e.g. Face matches ID photo, answered all questions"
              />
            </label>
            <button
              className="btn btn-primary"
              disabled={!readyToRecommend || !recommendation || submitting}
            >
              {submitting ? "Sending…" : "Send to reviewer"}
            </button>
          </form>
        </section>
      </div>
    </div>
  );
}

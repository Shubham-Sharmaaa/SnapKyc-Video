"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// Records the customer's video with both sides' audio mixed together, on the
// agent's browser. MediaRecorder needs a single stream, so the two audio
// tracks are merged with the Web Audio API.

const MIME_TYPES = [
  "video/webm;codecs=vp8,opus",
  "video/webm",
  "video/mp4", // Safari
];

function pickMimeType() {
  return MIME_TYPES.find((type) => MediaRecorder.isTypeSupported(type)) ?? "";
}

export function useRecorder() {
  const recorderRef = useRef<MediaRecorder | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const [recording, setRecording] = useState(false);
  const [startedAt, setStartedAt] = useState<number | null>(null);

  const cleanup = useCallback(() => {
    recorderRef.current = null;
    void audioContextRef.current?.close();
    audioContextRef.current = null;
    setRecording(false);
  }, []);

  const start = useCallback(
    (remote: MediaStream, local: MediaStream | null) => {
      if (recorderRef.current) return;

      const audioContext = new AudioContext();
      void audioContext.resume();
      const mix = audioContext.createMediaStreamDestination();
      for (const stream of [remote, local]) {
        if (stream && stream.getAudioTracks().length > 0) {
          audioContext.createMediaStreamSource(stream).connect(mix);
        }
      }

      const stream = new MediaStream([
        ...remote.getVideoTracks(),
        ...mix.stream.getAudioTracks(),
      ]);
      const mimeType = pickMimeType();
      // Low bitrate keeps a 10 minute call well under the 50 MB storage limit.
      const recorder = new MediaRecorder(stream, {
        ...(mimeType ? { mimeType } : {}),
        videoBitsPerSecond: 500_000,
        audioBitsPerSecond: 64_000,
      });

      chunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.start(1000);

      recorderRef.current = recorder;
      audioContextRef.current = audioContext;
      setRecording(true);
      setStartedAt(Date.now());
    },
    [],
  );

  const stop = useCallback(
    () =>
      new Promise<Blob | null>((resolve) => {
        const recorder = recorderRef.current;
        if (!recorder || recorder.state === "inactive") {
          cleanup();
          resolve(null);
          return;
        }
        recorder.onstop = () => {
          const type = recorder.mimeType.split(";")[0] || "video/webm";
          const blob = new Blob(chunksRef.current, { type });
          chunksRef.current = [];
          cleanup();
          resolve(blob.size > 0 ? blob : null);
        };
        recorder.stop();
      }),
    [cleanup],
  );

  useEffect(() => {
    return () => {
      if (recorderRef.current?.state !== "inactive") recorderRef.current?.stop();
      void audioContextRef.current?.close();
    };
  }, []);

  return { recording, startedAt, start, stop };
}

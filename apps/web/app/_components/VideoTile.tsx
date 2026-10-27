"use client";

import { useEffect, useRef, useState, type RefObject } from "react";

type Props = {
  stream: MediaStream | null;
  label: string;
  muted?: boolean;
  small?: boolean;
  placeholder?: string;
  videoRef?: RefObject<HTMLVideoElement | null>;
};

export function VideoTile({
  stream,
  label,
  muted = false,
  small = false,
  placeholder = "No video",
  videoRef,
}: Props) {
  const innerRef = useRef<HTMLVideoElement>(null);
  const ref = videoRef ?? innerRef;
  // Browsers may block video with sound from playing by itself, e.g. after a
  // refresh rejoins the call before the user has tapped anything.
  const [blockedStream, setBlockedStream] = useState<MediaStream | null>(null);

  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    video.srcObject = stream;
    if (stream && !muted) {
      video.play().catch(() => setBlockedStream(stream));
    }
  }, [ref, stream, muted]);

  return (
    <div className={small ? "video-tile video-tile-small" : "video-tile"}>
      <video ref={ref} autoPlay playsInline muted={muted} />
      {!stream && <div className="video-placeholder">{placeholder}</div>}
      {stream && blockedStream === stream && (
        <button
          className="video-unblock"
          onClick={() =>
            ref.current
              ?.play()
              .then(() => setBlockedStream(null))
              .catch(() => {})
          }
        >
          Tap to play video and sound
        </button>
      )}
      <span className="video-label">{label}</span>
    </div>
  );
}

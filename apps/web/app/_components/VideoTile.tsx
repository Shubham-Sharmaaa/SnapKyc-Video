"use client";

import { useEffect, useRef, type RefObject } from "react";

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

  useEffect(() => {
    if (ref.current) ref.current.srcObject = stream;
  }, [ref, stream]);

  return (
    <div className={small ? "video-tile video-tile-small" : "video-tile"}>
      <video ref={ref} autoPlay playsInline muted={muted} />
      {!stream && <div className="video-placeholder">{placeholder}</div>}
      <span className="video-label">{label}</span>
    </div>
  );
}

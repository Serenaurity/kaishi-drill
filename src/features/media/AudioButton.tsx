import { useRef, useState } from "react";
import type { MediaRepository } from "./media-repository";
import { useMediaUrl } from "./useMediaUrl";

interface AudioButtonProps {
  label: string;
  mediaId?: string;
  repository: MediaRepository;
}

export function AudioButton({ label, mediaId, repository }: AudioButtonProps) {
  const audio = useRef<HTMLAudioElement>(null);
  const [error, setError] = useState(false);
  const url = useMediaUrl(mediaId, repository);
  const unavailable = !mediaId || error;

  function play() {
    const result = audio.current?.play();
    if (result) void result.catch(() => setError(true));
  }

  return (
    <div className="audio-control">
      <button
        type="button"
        className="button-secondary media-button"
        disabled={unavailable || !url}
        onClick={play}
      >
        {label}
      </button>
      {url && <audio ref={audio} src={url} preload="none" onError={() => setError(true)} />}
      {unavailable && <span className="media-unavailable">{label} unavailable</span>}
    </div>
  );
}

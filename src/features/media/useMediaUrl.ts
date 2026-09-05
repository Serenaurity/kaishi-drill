import { useEffect, useState } from "react";
import type { MediaRepository } from "./media-repository";

export function useMediaUrl(
  mediaId: string | undefined,
  repository: MediaRepository,
): string | undefined {
  const [url, setUrl] = useState<string>();

  useEffect(() => {
    let active = true;
    let objectUrl: string | undefined;
    setUrl(undefined);
    if (mediaId) {
      void repository.getBlob(mediaId).then((blob) => {
        if (!blob) return;
        objectUrl = URL.createObjectURL(blob);
        if (active) setUrl(objectUrl);
        else URL.revokeObjectURL(objectUrl);
      }).catch(() => {
        if (active) setUrl(undefined);
      });
    }
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [mediaId, repository]);

  return url;
}

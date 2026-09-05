import { useState } from "react";
import type { MediaRepository } from "../../media/media-repository";
import { useMediaUrl } from "../../media/useMediaUrl";
import type { StudyPrompt } from "../study-session";

interface PromptCardProps {
  prompt: StudyPrompt;
  repository: MediaRepository;
}

export function PromptCard({ prompt, repository }: PromptCardProps) {
  const pictureUrl = useMediaUrl(prompt.note.pictureMediaId, repository);
  const [failedPictureUrl, setFailedPictureUrl] = useState<string>();
  const canShowPicture = pictureUrl && failedPictureUrl !== pictureUrl;
  const skillLabel = prompt.card.skill === "reading" ? "Reading" : "English meaning";

  return (
    <article className="study-card" aria-labelledby="study-word">
      <p className="skill-label">{skillLabel}</p>
      <div className="prompt-media">
        {canShowPicture ? (
          <img
            src={pictureUrl}
            alt={`Illustration for ${prompt.note.word}`}
            onError={() => setFailedPictureUrl(pictureUrl)}
          />
        ) : (
          <span className="media-unavailable">Image unavailable</span>
        )}
      </div>
      <p id="study-word" className="prompt-word" lang="ja">{prompt.note.word}</p>
      <p className="prompt-direction">
        {prompt.card.skill === "reading"
          ? "Type the Japanese reading in kana or romaji."
          : "Type the English meaning."}
      </p>
    </article>
  );
}

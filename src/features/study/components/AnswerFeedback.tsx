import type { GradeResult } from "../grading/types";
import type { StudyPrompt } from "../study-session";

interface AnswerFeedbackProps {
  prompt: StudyPrompt;
  feedback: GradeResult;
}

function Detail({ label, value, lang }: { label: string; value: string; lang?: string }) {
  if (!value) return null;
  return (
    <div>
      <dt>{label}</dt>
      <dd lang={lang}>{value}</dd>
    </div>
  );
}

export function AnswerFeedback({ prompt, feedback }: AnswerFeedbackProps) {
  const label = feedback.grade === "correct" ? "Correct" : feedback.grade === "close" ? "Close" : "Incorrect";
  const canonical = prompt.card.skill === "reading" ? prompt.note.reading : prompt.note.meaning;
  return (
    <section className="answer-feedback" aria-labelledby="feedback-heading" aria-live="polite">
      <div className="feedback-header">
        <h2 id="feedback-heading" className="feedback-label" data-grade={feedback.grade}>{label}</h2>
        <p>Suggested rating: <strong>{feedback.suggestedRating}</strong></p>
      </div>
      <p>{feedback.reason}</p>
      <p className="canonical-answer">
        <span>Canonical answer</span>
        <strong lang={prompt.card.skill === "reading" ? "ja" : "en"}>{canonical}</strong>
      </p>
      <dl className="study-details">
        <Detail label="Reading" value={prompt.note.reading} lang="ja" />
        <Detail label="Meaning" value={prompt.note.meaning} />
        <Detail label="Word furigana" value={prompt.note.wordFurigana} lang="ja" />
        <Detail label="Sentence" value={prompt.note.sentence} lang="ja" />
        <Detail label="Sentence meaning" value={prompt.note.sentenceMeaning} />
        <Detail label="Sentence furigana" value={prompt.note.sentenceFurigana} lang="ja" />
        <Detail label="Pitch accent" value={prompt.note.pitchAccent} />
        <Detail label="Pitch notes" value={prompt.note.pitchAccentNotes} />
        <Detail label="Notes" value={prompt.note.notes} />
      </dl>
    </section>
  );
}

import { type FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { openKaishiDb } from "../../storage/db";
import { createMediaRepository, type MediaRepository } from "../media/media-repository";
import { AnswerFeedback } from "./components/AnswerFeedback";
import { PromptCard } from "./components/PromptCard";
import { RatingBar } from "./components/RatingBar";
import type { GradeResult } from "./grading/types";
import { createScheduler, DEFAULT_SCHEDULER_CONFIG } from "./scheduler";
import {
  createStudySession,
  ScheduleConflictError,
  type StudyPrompt,
  type StudySession,
} from "./study-session";
import type { Rating } from "../../domain/models";
import { setReviewInteractionActive } from "../../app/review-activity";

interface StudyPageProps {
  session?: StudySession;
  mediaRepository?: MediaRepository;
}

interface StudyServices {
  session: StudySession;
  repository: MediaRepository;
}

const EMPTY_MEDIA: MediaRepository = { getBlob: async () => undefined };
let sharedServices: StudyServices | undefined;

function defaultServices(): StudyServices {
  if (sharedServices) return sharedServices;
  const db = openKaishiDb();
  const scheduler = createScheduler(DEFAULT_SCHEDULER_CONFIG);
  sharedServices = {
    repository: createMediaRepository(db),
    session: createStudySession({
      db,
      scheduler,
      now: () => new Date(),
      timezone: () => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
    }),
  };
  return sharedServices;
}

export function StudyPage({ session, mediaRepository }: StudyPageProps) {
  const [services] = useState<StudyServices>(() => session
    ? { session, repository: mediaRepository ?? EMPTY_MEDIA }
    : defaultServices());
  const [phase, setPhase] = useState<"loading" | "prompt" | "revealed" | "empty">("loading");
  const [prompt, setPrompt] = useState<StudyPrompt>();
  const [answer, setAnswer] = useState("");
  const [feedback, setFeedback] = useState<GradeResult>();
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);
  const startedAt = useRef(performance.now());
  const answerInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let active = true;
    void services.session.loadNext().then((next) => {
      if (!active) return;
      setPrompt(next);
      setPhase(next ? "prompt" : "empty");
      startedAt.current = performance.now();
    }).catch((reason) => {
      if (!active) return;
      setError(reason instanceof Error ? reason.message : "Unable to load the study queue");
      setPhase("empty");
    });
    return () => {
      active = false;
    };
  }, [services]);

  useEffect(() => {
    if (phase === "prompt") answerInput.current?.focus();
  }, [phase, prompt]);

  useEffect(() => {
    setReviewInteractionActive(Boolean(prompt) && (answer.length > 0 || phase === "revealed" || saving));
  }, [answer, phase, prompt, saving]);

  useEffect(() => () => setReviewInteractionActive(false), []);

  function reveal(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!prompt || phase !== "prompt" || !answer.trim()) return;
    setError(undefined);
    try {
      setFeedback(services.session.submitAnswer(answer, performance.now() - startedAt.current));
      setPhase("revealed");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to grade this answer");
    }
  }

  const rate = useCallback(async (rating: Rating) => {
    if (phase !== "revealed" || saving) return;
    setSaving(true);
    setError(undefined);
    try {
      const next = await services.session.confirmRating(rating);
      setPrompt(next);
      setAnswer("");
      setFeedback(undefined);
      setPhase(next ? "prompt" : "empty");
      startedAt.current = performance.now();
    } catch (reason) {
      setError(reason instanceof ScheduleConflictError
        ? `${reason.message} Reload this page to continue safely.`
        : reason instanceof Error ? `${reason.message} Try again.` : "The rating could not be saved. Try again.");
    } finally {
      setSaving(false);
    }
  }, [phase, saving, services]);

  useEffect(() => {
    if (phase !== "revealed") return;
    const ratings: Record<string, Rating> = { "1": "again", "2": "hard", "3": "good", "4": "easy" };
    const onKeyDown = (event: KeyboardEvent) => {
      const rating = ratings[event.key];
      if (!rating || event.altKey || event.ctrlKey || event.metaKey) return;
      event.preventDefault();
      void rate(rating);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [phase, rate]);

  if (phase === "loading") return <p role="status">Loading vocabulary queue…</p>;
  if (phase === "empty" || !prompt) {
    return (
      <section className="study-empty" aria-labelledby="study-heading">
        <p className="eyebrow">Vocabulary</p>
        <h1 id="study-heading">Nothing due right now</h1>
        <p className="lede">Import and initialize a Kaishi deck, or return after the next scheduled review.</p>
        <a className="button-link" href="/import">Import a deck</a>
        {error && <p className="field-error" role="alert">{error}</p>}
      </section>
    );
  }

  return (
    <section className="study-page" aria-labelledby="study-heading">
      <div className="study-heading-row">
        <div>
          <p className="eyebrow">Vocabulary production</p>
          <h1 id="study-heading">Study</h1>
        </div>
        <span className="schedule-state">{prompt.schedule.state}</span>
      </div>
      <PromptCard prompt={prompt} repository={services.repository} />
      <form className="answer-panel" onSubmit={reveal} noValidate>
        <label htmlFor="study-answer">Your answer</label>
        <div className="answer-row">
          <input
            ref={answerInput}
            id="study-answer"
            value={answer}
            onChange={(event) => setAnswer(event.target.value)}
            disabled={phase === "revealed" || saving}
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            aria-describedby={error ? "study-error" : undefined}
          />
          <button type="submit" disabled={!answer.trim() || phase === "revealed" || saving}>Check</button>
        </div>
        {error && <p id="study-error" className="field-error" role="alert">{error}</p>}
      </form>
      {phase === "revealed" && feedback && (
        <AnswerFeedback prompt={prompt} feedback={feedback} />
      )}
      <RatingBar
        intervals={prompt.intervals}
        disabled={phase !== "revealed" || saving}
        suggested={feedback?.suggestedRating}
        onRate={(rating) => void rate(rating)}
      />
      <p className="keyboard-help">
        {phase === "revealed" ? "Choose 1–4 to confirm the final rating." : "Type an answer and press Enter to reveal."}
      </p>
    </section>
  );
}

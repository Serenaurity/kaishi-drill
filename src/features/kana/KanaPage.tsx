import { type FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { localDateInTimeZone } from "../../domain/dates";
import { openKaishiDb } from "../../storage/db";
import { KANA_CATALOG, type KanaEntry } from "./kana-catalog";
import {
  createDexieKanaRepository,
  createKanaSession,
  type KanaRepository,
  type KanaSession,
} from "./kana-session";
import type { KanaGrade } from "./kana-grader";
import { StrokeOrder } from "./StrokeOrder";

type SelectionKey = `${KanaEntry["script"]}:${KanaEntry["group"]}`;

interface KanaPageProps {
  repository?: KanaRepository;
  now?: () => Date;
  timezone?: () => string;
  speechSynthesisOverride?: SpeechSynthesis | null;
}

const GROUPS: readonly KanaEntry["group"][] = ["basic", "dakuten", "handakuten", "yoon"];
const SCRIPTS: readonly KanaEntry["script"][] = ["hiragana", "katakana"];
const LABELS: Record<KanaEntry["group"], string> = {
  basic: "Basic",
  dakuten: "Dakuten",
  handakuten: "Handakuten",
  yoon: "Yōon combinations",
};

let sharedRepository: KanaRepository | undefined;

function defaultTimezone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

function defaultRepository(): KanaRepository {
  sharedRepository ??= createDexieKanaRepository(openKaishiDb(), {
    now: () => new Date(),
    timezone: defaultTimezone,
  });
  return sharedRepository;
}

function selectionKey(script: KanaEntry["script"], group: KanaEntry["group"]): SelectionKey {
  return `${script}:${group}`;
}

function useJapaneseVoice(synth: SpeechSynthesis | null): SpeechSynthesisVoice | undefined {
  const [voice, setVoice] = useState<SpeechSynthesisVoice>();
  useEffect(() => {
    if (!synth) {
      setVoice(undefined);
      return;
    }
    const refresh = () => setVoice(synth.getVoices().find((candidate) => /^ja(?:-|_)/i.test(candidate.lang)));
    refresh();
    synth.addEventListener("voiceschanged", refresh);
    return () => synth.removeEventListener("voiceschanged", refresh);
  }, [synth]);
  return voice;
}

export function KanaPage({
  repository = defaultRepository(),
  now = () => new Date(),
  timezone = defaultTimezone,
  speechSynthesisOverride,
}: KanaPageProps) {
  const synth = speechSynthesisOverride === undefined
    ? (typeof window !== "undefined" && "speechSynthesis" in window ? window.speechSynthesis : null)
    : speechSynthesisOverride;
  const voice = useJapaneseVoice(synth);
  const [selected, setSelected] = useState<Set<SelectionKey>>(new Set());
  const [mode, setMode] = useState<"standard" | "focus">("standard");
  const [session, setSession] = useState<KanaSession>();
  const [entry, setEntry] = useState<KanaEntry>();
  const [answer, setAnswer] = useState("");
  const [grade, setGrade] = useState<KanaGrade>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [completed, setCompleted] = useState(0);
  const startedAt = useRef(performance.now());
  const answerInput = useRef<HTMLInputElement>(null);
  const nextButton = useRef<HTMLButtonElement>(null);
  const selectedEntries = useMemo(() => KANA_CATALOG.filter((candidate) =>
    selected.has(selectionKey(candidate.script, candidate.group))), [selected]);

  useEffect(() => {
    if (busy) return;
    if (entry && !grade) answerInput.current?.focus();
    if (grade) nextButton.current?.focus();
  }, [busy, entry, grade]);

  function toggle(key: SelectionKey) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function start() {
    if (selectedEntries.length === 0 || busy) return;
    setBusy(true);
    setError(undefined);
    try {
      const started = now();
      const nextSession = createKanaSession({
        mode,
        seed: `${localDateInTimeZone(started, timezone())}:${mode}`,
        entries: selectedEntries,
        now,
      }, repository);
      const next = await nextSession.next();
      setSession(nextSession);
      setEntry(next);
      setGrade(undefined);
      setAnswer("");
      setCompleted(0);
      startedAt.current = performance.now();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to start Kana practice");
    } finally {
      setBusy(false);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (grade) {
      await next();
      return;
    }
    if (!session || !entry || !answer.trim() || busy) return;
    setBusy(true);
    setError(undefined);
    try {
      const result = await session.answer(answer, performance.now() - startedAt.current);
      setCompleted((value) => value + 1);
      if (result.correct) {
        try {
          await advance(session);
        } catch (reason) {
          setGrade(result);
          throw reason;
        }
      } else {
        setGrade(result);
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to save this attempt");
    } finally {
      setBusy(false);
    }
  }

  async function advance(activeSession: KanaSession) {
    const nextEntry = await activeSession.next();
    setEntry(nextEntry);
    setAnswer("");
    setGrade(undefined);
    startedAt.current = performance.now();
  }

  async function next() {
    if (!session || busy) return;
    setBusy(true);
    setError(undefined);
    try {
      await advance(session);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to load the next Kana");
    } finally {
      setBusy(false);
    }
  }

  function pronounce() {
    if (!synth || !voice || !entry) return;
    synth.cancel();
    const utterance = new SpeechSynthesisUtterance(entry.kana);
    utterance.lang = voice.lang;
    utterance.voice = voice;
    synth.speak(utterance);
  }

  if (!session) {
    return (
      <section className="kana-page" aria-labelledby="kana-heading">
        <p className="eyebrow">Independent mastery</p>
        <h1 id="kana-heading">Kana Trainer</h1>
        <p className="lede">Choose the scripts and groups you want to recognize, then type each answer in romaji.</p>
        <div className="kana-setup">
          <div className="kana-selection-toolbar">
            <button type="button" className="button-secondary" onClick={() => setSelected(new Set(
              SCRIPTS.flatMap((script) => GROUPS.map((group) => selectionKey(script, group))),
            ))}>Check all</button>
            <button type="button" className="button-secondary" onClick={() => setSelected(new Set())}>Clear all</button>
          </div>
          <div className="kana-selection-grid">
            {SCRIPTS.map((script) => (
              <fieldset key={script}>
                <legend>{script === "hiragana" ? "Hiragana" : "Katakana"}</legend>
                {GROUPS.map((group) => {
                  const key = selectionKey(script, group);
                  return (
                    <label key={group}>
                      <input type="checkbox" checked={selected.has(key)} onChange={() => toggle(key)} />
                      <span>{script === "hiragana" ? "Hiragana" : "Katakana"} {LABELS[group]}</span>
                    </label>
                  );
                })}
              </fieldset>
            ))}
          </div>
          <fieldset className="kana-mode">
            <legend>Practice mode</legend>
            <label><input type="radio" name="kana-mode" checked={mode === "standard"} onChange={() => setMode("standard")} /> Standard</label>
            <label><input type="radio" name="kana-mode" checked={mode === "focus"} onChange={() => setMode("focus")} /> Focus recent mistakes</label>
          </fieldset>
          <p className="selection-summary" role="status">{selectedEntries.length} kana selected</p>
          <button type="button" onClick={() => void start()} disabled={selectedEntries.length === 0 || busy}>
            {busy ? "Starting…" : "Start"}
          </button>
          {!voice && <p className="media-unavailable">Pronunciation unavailable on this device</p>}
          {error && <p className="field-error" role="alert">{error}</p>}
        </div>
      </section>
    );
  }

  if (!entry) {
    return (
      <section className="study-empty" aria-labelledby="kana-complete-heading">
        <p className="eyebrow">Kana Trainer</p>
        <h1 id="kana-complete-heading">Session complete</h1>
        <p className="lede">{completed} attempts saved to this device.</p>
        <button type="button" onClick={() => setSession(undefined)}>Choose another set</button>
      </section>
    );
  }

  return (
    <section className="kana-page kana-session-page" aria-labelledby="kana-heading">
      <div className="study-heading-row">
        <div><p className="eyebrow">Kana recognition</p><h1 id="kana-heading">Kana Trainer</h1></div>
        <span className="schedule-state">{completed} done</span>
      </div>
      <article className="kana-card" aria-labelledby="kana-prompt">
        <p className="skill-label">{entry.script} · {LABELS[entry.group]}</p>
        <p id="kana-prompt" className="kana-prompt" lang="ja">{entry.kana}</p>
        <StrokeOrder entry={entry} />
        {voice ? (
          <button type="button" className="button-secondary" onClick={pronounce}>Play pronunciation</button>
        ) : (
          <p className="media-unavailable">Pronunciation unavailable on this device</p>
        )}
      </article>
      <form className="answer-panel" onSubmit={(event) => void submit(event)}>
        <label htmlFor="kana-answer">Romaji</label>
        <div className="answer-row">
          <input
            ref={answerInput}
            id="kana-answer"
            value={answer}
            onChange={(event) => setAnswer(event.target.value)}
            disabled={Boolean(grade) || busy}
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
          />
          {grade ? (
            <button ref={nextButton} type="submit" disabled={busy}>{busy ? "Loading…" : "Next"}</button>
          ) : (
            <button type="submit" disabled={!answer.trim() || busy}>Check</button>
          )}
        </div>
        {error && <p className="field-error" role="alert">{error}</p>}
      </form>
      {grade && (
        <section className="kana-feedback" aria-live="polite">
          <h2 data-grade={grade.correct ? "correct" : "incorrect"}>{grade.correct ? "Correct" : "Incorrect"}</h2>
          <p>Accepted answer: <strong>{entry.romaji.join(" / ")}</strong></p>
        </section>
      )}
    </section>
  );
}

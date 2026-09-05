import { useState } from "react";
import type { ImportMode } from "../../domain/models";
import { openKaishiDb } from "../../storage/db";
import {
  initializeProgress,
  type ProgressInitReport,
  type ProgressInitRequest,
} from "./progress-initializer";

interface ProgressChoiceProps {
  deckId: string;
  schedulingAvailable: boolean;
  initialize?: (request: ProgressInitRequest) => Promise<ProgressInitReport>;
}

async function initializeDefault(request: ProgressInitRequest): Promise<ProgressInitReport> {
  const db = openKaishiDb();
  try {
    return await initializeProgress(request, db);
  } finally {
    db.close();
  }
}

export function ProgressChoice({
  deckId,
  schedulingAvailable,
  initialize = initializeDefault,
}: ProgressChoiceProps) {
  const [busy, setBusy] = useState<ImportMode>();
  const [result, setResult] = useState<ProgressInitReport>();
  const [error, setError] = useState<string>();

  async function choose(mode: ImportMode) {
    if (busy || result) return;
    setBusy(mode);
    setError(undefined);
    try {
      setResult(await initialize({ deckId, mode, now: new Date() }));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Study setup failed");
    } finally {
      setBusy(undefined);
    }
  }

  if (result) {
    return (
      <div className="progress-choice progress-choice-complete" role="status">
        <h3>Study setup complete</h3>
        <p>{result.skillCardsCreated.toLocaleString()} reading and meaning cards are ready.</p>
        {result.warnings.length > 0 && (
          <ul>
            {result.warnings.map((warning) => <li key={warning}>{warning}</li>)}
          </ul>
        )}
        <a className="button-link" href="/study">Begin vocabulary study</a>
      </div>
    );
  }

  return (
    <div className="progress-choice" aria-labelledby="progress-choice-heading">
      <h3 id="progress-choice-heading">Choose your starting point</h3>
      <p>Start with a clean schedule or carry forward usable scheduling data from Anki.</p>
      <div className="choice-grid">
        <button type="button" disabled={Boolean(busy)} onClick={() => void choose("fresh")}>
          {busy === "fresh" ? "Starting…" : "Start Fresh"}
        </button>
        <button
          type="button"
          className="button-secondary"
          disabled={Boolean(busy) || !schedulingAvailable}
          onClick={() => void choose("continue")}
        >
          {busy === "continue" ? "Continuing…" : "Continue from Anki"}
        </button>
      </div>
      {!schedulingAvailable && (
        <p className="field-help">
          Export the deck from Anki with scheduling information, then import that package.
        </p>
      )}
      {error && <p className="field-error" role="alert">{error}</p>}
    </div>
  );
}

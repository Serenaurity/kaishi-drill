import { type FormEvent, useEffect, useRef, useState } from "react";
import { createImportClient, type ImportClient } from "./import-client";
import type { ImportProgress, ImportReport } from "./types";

interface ImportPageProps {
  client?: ImportClient;
}

function isAbortError(reason: unknown): boolean {
  return (
    typeof reason === "object" &&
    reason !== null &&
    "name" in reason &&
    reason.name === "AbortError"
  );
}

export function ImportPage({ client }: ImportPageProps) {
  const [importClient] = useState(() => client ?? createImportClient());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [progress, setProgress] = useState<ImportProgress>();
  const [report, setReport] = useState<ImportReport>();
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => () => importClient.cancel(), [importClient]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) {
      return;
    }

    const file = input.current?.files?.[0];
    setError(undefined);
    setReport(undefined);
    if (!file) {
      setError("Choose an Anki package before importing.");
      input.current?.focus();
      return;
    }

    setBusy(true);
    setProgress({
      stage: "validate-package",
      completed: 0,
      total: 1,
      message: "Preparing local import",
    });
    try {
      setReport(await importClient.start(file, file.name, setProgress));
    } catch (reason) {
      setProgress(undefined);
      setError(
        isAbortError(reason)
          ? "Import cancelled. Choose a package and try again."
          : reason instanceof Error
            ? `${reason.message} Check that this is a modern Kaishi .apkg or .colpkg file, then try again.`
            : "Import failed. Choose a modern Kaishi package and try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  function cancelImport() {
    importClient.cancel();
  }

  const progressMaximum = Math.max(progress?.total ?? 1, 1);
  const progressValue = Math.min(progress?.completed ?? 0, progressMaximum);

  return (
    <section aria-labelledby="import-heading">
      <p className="eyebrow">Private by design</p>
      <h1 id="import-heading">Import a deck</h1>
      <p className="lede">
        Your package is processed locally on this device and is never uploaded.
      </p>

      <form onSubmit={submit} noValidate aria-busy={busy}>
        <div className="field-group">
          <label htmlFor="package">Anki package</label>
          <input
            ref={input}
            id="package"
            name="package"
            type="file"
            accept=".apkg,.colpkg"
            disabled={busy}
            aria-describedby={`package-help${error ? " package-error" : ""}`}
          />
          <p id="package-help" className="field-help">
            Use a modern Kaishi 1.5k export. Images, word audio and sentence audio are kept
            offline.
          </p>
          {error && (
            <p id="package-error" className="field-error" role="alert">
              {error}
            </p>
          )}
        </div>

        <div className="button-row">
          <button type="submit" disabled={busy}>
            {busy ? "Importing…" : "Import package"}
          </button>
          {busy && (
            <button type="button" className="button-secondary" onClick={cancelImport}>
              Cancel import
            </button>
          )}
        </div>

        <div className="import-status" aria-live="polite" aria-atomic="true">
          {progress && !report && (
            <div
              className="progress-block"
              role="progressbar"
              aria-label="Import progress"
              aria-valuemin={0}
              aria-valuemax={progressMaximum}
              aria-valuenow={progressValue}
            >
              <span>{progress.message}</span>
              <span className="progress-count">
                {progressValue} of {progressMaximum}
              </span>
              <span className="progress-track" aria-hidden="true">
                <span
                  className="progress-value"
                  style={{ width: `${(progressValue / progressMaximum) * 100}%` }}
                />
              </span>
            </div>
          )}
          {report && (
            <div className="import-report" role="status">
              <h2>Deck imported</h2>
              <p>
                {report.notes.toLocaleString()} notes, {report.images.toLocaleString()} images and{" "}
                {report.audio.toLocaleString()} audio files are ready on this device.
              </p>
              {report.warnings.length > 0 && (
                <details>
                  <summary>{report.warnings.length} import warnings</summary>
                  <ul>
                    {report.warnings.map((warning) => (
                      <li key={warning}>{warning}</li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
          )}
        </div>
      </form>
    </section>
  );
}

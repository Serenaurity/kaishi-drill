import { type ChangeEvent, type FormEvent, useEffect, useState } from "react";
import { openKaishiDb } from "../../storage/db";
import {
  getStudyLimits,
  setStudyLimits,
  type StudyLimits,
} from "../../storage/repositories";
import {
  exportProgress,
  resetData,
  restoreProgress,
  validateProgressBackup,
  type ProgressBackupV1,
} from "../../storage/backup";

type ResetScope = "session" | "progress" | "all";

export interface SettingsActions {
  loadStudyLimits(): Promise<StudyLimits>;
  saveStudyLimits(limits: StudyLimits): Promise<void>;
  exportBackup(): Promise<Blob>;
  parseBackup(file: File): Promise<ProgressBackupV1>;
  restoreBackup(backup: ProgressBackupV1): Promise<void>;
  reset(scope: ResetScope): Promise<void>;
}

let sharedActions: SettingsActions | undefined;

function defaultActions(): SettingsActions {
  if (sharedActions) return sharedActions;
  const db = openKaishiDb();
  sharedActions = {
    loadStudyLimits: () => getStudyLimits(db),
    saveStudyLimits: (limits) => setStudyLimits(db, limits),
    exportBackup: () => exportProgress(db),
    async parseBackup(file) {
      if (file.size > 25 * 1024 * 1024) throw new Error("Backup files must be 25 MB or smaller");
      return validateProgressBackup(JSON.parse(await file.text()));
    },
    restoreBackup: (backup) => restoreProgress(db, backup),
    reset: (scope) => resetData(db, scope),
  };
  return sharedActions;
}

function resetLabel(scope: ResetScope): string {
  if (scope === "session") return "session state";
  if (scope === "progress") return "progress";
  return "all local data";
}

export function SettingsPage({ actions = defaultActions() }: { actions?: SettingsActions }) {
  const [limitDraft, setLimitDraft] = useState({ newPerDay: "", reviewsPerDay: "" });
  const [limitsLoading, setLimitsLoading] = useState(true);
  const [limitError, setLimitError] = useState<string>();
  const [pendingReset, setPendingReset] = useState<ResetScope>();
  const [pendingRestore, setPendingRestore] = useState<ProgressBackupV1>();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    let active = true;
    void actions.loadStudyLimits().then((limits) => {
      if (!active) return;
      setLimitDraft({
        newPerDay: String(limits.newPerDay),
        reviewsPerDay: String(limits.reviewsPerDay),
      });
      setLimitsLoading(false);
    }).catch((reason) => {
      if (!active) return;
      setError(reason instanceof Error ? reason.message : "Unable to load study limits");
      setLimitsLoading(false);
    });
    return () => { active = false; };
  }, [actions]);

  function parseLimit(label: string, value: string): number {
    const trimmed = value.trim();
    if (!/^\d+$/.test(trimmed)) throw new Error(`${label} must be a whole number`);
    const parsed = Number(trimmed);
    if (parsed > 9_999) throw new Error(`${label} must be between 0 and 9999`);
    return parsed;
  }

  async function saveLimits(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || limitsLoading) return;
    setLimitError(undefined);
    setMessage(undefined);
    let limits: StudyLimits;
    try {
      limits = {
        newPerDay: parseLimit("New cards per day", limitDraft.newPerDay),
        reviewsPerDay: parseLimit("Maximum reviews per day", limitDraft.reviewsPerDay),
      };
    } catch (reason) {
      setLimitError(reason instanceof Error ? reason.message : "Study limits are invalid");
      return;
    }
    setBusy(true);
    try {
      await actions.saveStudyLimits(limits);
      setMessage("Study limits saved.");
    } catch (reason) {
      setLimitError(reason instanceof Error ? reason.message : "Unable to save study limits");
    } finally {
      setBusy(false);
    }
  }

  async function downloadBackup() {
    if (busy) return;
    setBusy(true);
    setError(undefined);
    try {
      const blob = await actions.exportBackup();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `kaishi-progress-${new Date().toISOString().slice(0, 10)}.json`;
      anchor.click();
      URL.revokeObjectURL(url);
      setMessage("Progress backup exported.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to export progress");
    } finally {
      setBusy(false);
    }
  }

  async function chooseRestore(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || busy) return;
    setBusy(true);
    setError(undefined);
    setMessage(undefined);
    try {
      setPendingRestore(await actions.parseBackup(file));
      setPendingReset(undefined);
    } catch (reason) {
      setPendingRestore(undefined);
      setError(reason instanceof Error ? reason.message : "Unable to read the backup file");
    } finally {
      setBusy(false);
    }
  }

  async function confirmRestore() {
    if (!pendingRestore || busy) return;
    setBusy(true);
    setError(undefined);
    try {
      await actions.restoreBackup(pendingRestore);
      setPendingRestore(undefined);
      setMessage("Progress restored. Reload an open study tab before continuing.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to restore progress");
    } finally {
      setBusy(false);
    }
  }

  async function confirmReset() {
    if (!pendingReset || busy) return;
    const scope = pendingReset;
    setBusy(true);
    setError(undefined);
    try {
      await actions.reset(scope);
      setPendingReset(undefined);
      setMessage(`${resetLabel(scope)} reset complete.`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to reset local data");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="settings-page" aria-labelledby="settings-heading">
      <p className="eyebrow">Local data controls</p>
      <h1 id="settings-heading">Settings</h1>
      <p className="lede">Back up your progress before replacing or clearing anything. Deck media stays on this device.</p>

      <div className="settings-grid">
        <section className="settings-panel study-limits-panel" aria-labelledby="study-limits-heading">
          <p className="eyebrow">Anki-compatible recommendation</p>
          <h2 id="study-limits-heading">Study limits</h2>
          <p>
            New limits count cards, not notes. Reading and Meaning are separate cards, so 20 New cards usually introduces about 10 vocabulary words.
          </p>
          <form className="study-limits-form" onSubmit={(event) => void saveLimits(event)} noValidate>
            <div className="study-limit-fields">
              <div className="field-group">
                <label htmlFor="daily-new-limit">New cards per day</label>
                <input
                  id="daily-new-limit"
                  type="number"
                  min="0"
                  max="9999"
                  step="1"
                  inputMode="numeric"
                  value={limitDraft.newPerDay}
                  onChange={(event) => setLimitDraft((current) => ({ ...current, newPerDay: event.target.value }))}
                  disabled={busy || limitsLoading}
                  aria-describedby="study-limits-help"
                />
              </div>
              <div className="field-group">
                <label htmlFor="daily-review-limit">Maximum reviews per day</label>
                <input
                  id="daily-review-limit"
                  type="number"
                  min="0"
                  max="9999"
                  step="1"
                  inputMode="numeric"
                  value={limitDraft.reviewsPerDay}
                  onChange={(event) => setLimitDraft((current) => ({ ...current, reviewsPerDay: event.target.value }))}
                  disabled={busy || limitsLoading}
                  aria-describedby="study-limits-help"
                />
              </div>
            </div>
            <p id="study-limits-help" className="field-help">Use 0 to pause New cards or reviews. Changes affect today's remaining allowance immediately.</p>
            {limitError && <p className="field-error" role="alert">{limitError}</p>}
            <div className="study-limit-actions">
              <button type="submit" disabled={busy || limitsLoading}>Save study limits</button>
              <button
                type="button"
                className="button-secondary"
                onClick={() => setLimitDraft({ newPerDay: "20", reviewsPerDay: "200" })}
                disabled={busy || limitsLoading}
              >
                Use recommended limits (20 / 200)
              </button>
            </div>
          </form>
        </section>

        <section className="settings-panel" aria-labelledby="backup-heading">
          <h2 id="backup-heading">Progress backup</h2>
          <p>Exports schedules, reviews, Kana mastery and settings. Imported deck media is excluded.</p>
          <button type="button" onClick={() => void downloadBackup()} disabled={busy}>Export progress backup</button>
        </section>

        <section className="settings-panel" aria-labelledby="restore-heading">
          <h2 id="restore-heading">Restore progress</h2>
          <p>Restore only after importing the same deck package. Kaishi verifies the package hash before writing.</p>
          <label className="file-action" htmlFor="restore-file">Progress backup file</label>
          <input id="restore-file" type="file" accept="application/json,.json" onChange={(event) => void chooseRestore(event)} disabled={busy} />
        </section>
      </div>

      {pendingRestore && (
        <section className="confirmation-panel" aria-labelledby="restore-confirm-heading">
          <h2 id="restore-confirm-heading">Replace current progress?</h2>
          <p>Export a backup before continuing. Restore replaces schedules, history, activity and Kana mastery.</p>
          <div className="confirmation-actions">
            <button type="button" className="button-secondary" onClick={() => void downloadBackup()} disabled={busy}>Export progress backup</button>
            <button type="button" onClick={() => void confirmRestore()} disabled={busy}>Confirm restore</button>
            <button type="button" className="button-secondary" onClick={() => setPendingRestore(undefined)} disabled={busy}>Cancel</button>
          </div>
        </section>
      )}

      <section className="settings-panel danger-panel" aria-labelledby="reset-heading">
        <h2 id="reset-heading">Reset local data</h2>
        <p>Choose the narrowest scope. Progress reset preserves imported notes and media; all data removes the complete local deck.</p>
        <div className="reset-actions">
          <button type="button" className="button-secondary" onClick={() => setPendingReset("session")}>Reset session state</button>
          <button type="button" className="button-secondary" onClick={() => setPendingReset("progress")}>Reset progress</button>
          <button type="button" className="button-secondary danger-button" onClick={() => setPendingReset("all")}>Reset all local data</button>
        </div>
      </section>

      {pendingReset && (
        <section className="confirmation-panel" aria-labelledby="reset-confirm-heading">
          <h2 id="reset-confirm-heading">Reset {resetLabel(pendingReset)}?</h2>
          <p>Export a backup before continuing. This action cannot be undone inside Kaishi Drill.</p>
          <div className="confirmation-actions">
            <button type="button" className="button-secondary" onClick={() => void downloadBackup()} disabled={busy}>Export progress backup</button>
            <button type="button" className={pendingReset === "all" ? "danger-button" : undefined} onClick={() => void confirmReset()} disabled={busy}>
              Confirm reset {resetLabel(pendingReset)}
            </button>
            <button type="button" className="button-secondary" onClick={() => setPendingReset(undefined)} disabled={busy}>Cancel</button>
          </div>
        </section>
      )}

      {message && <p className="success-message" role="status">{message}</p>}
      {error && <p className="field-error" role="alert">{error}</p>}
    </section>
  );
}

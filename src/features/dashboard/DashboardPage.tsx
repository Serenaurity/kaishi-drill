import { type CSSProperties, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { openKaishiDb } from "../../storage/db";
import {
  createDashboardService,
  type DashboardModel,
  type DashboardService,
} from "./dashboard-service";

interface DashboardPageProps {
  service?: DashboardService;
  now?: () => Date;
  timezone?: () => string;
}

let sharedService: DashboardService | undefined;
const currentTime = () => new Date();
const currentTimezone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

function defaultService(): DashboardService {
  sharedService ??= createDashboardService(openKaishiDb());
  return sharedService;
}

function dateLabel(localDate: string): string {
  const [year, month, day] = localDate.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", { dateStyle: "long", timeZone: "UTC" })
    .format(new Date(Date.UTC(year!, month! - 1, day!)));
}

function activityLabel(cell: DashboardModel["activity"][number]): string {
  return `${dateLabel(cell.localDate)}: ${cell.vocabularyReviews} vocabulary reviews, ${cell.kanaAttempts} Kana attempts`;
}

function shortDateLabel(localDate: string): string {
  const [year, month, day] = localDate.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year!, month! - 1, day!)));
}

export function DashboardPage({
  service = defaultService(),
  now = currentTime,
  timezone = currentTimezone,
}: DashboardPageProps) {
  const [model, setModel] = useState<DashboardModel>();
  const [error, setError] = useState<string>();
  const [selectedActivity, setSelectedActivity] = useState<string>();

  useEffect(() => {
    let active = true;
    void service.loadDashboard(now(), timezone()).then((loaded) => {
      if (active) setModel(loaded);
    }).catch((reason) => {
      if (active) setError(reason instanceof Error ? reason.message : "Unable to load study progress");
    });
    return () => { active = false; };
  }, [now, service, timezone]);

  if (error) return <p className="field-error" role="alert">{error}</p>;
  if (!model) return <p role="status">Loading study progress…</p>;

  return (
    <section className="dashboard-page" aria-labelledby="dashboard-heading">
      <div className="dashboard-intro">
        <div>
          <p className="eyebrow">Offline-first Japanese study</p>
          <h1 id="dashboard-heading">Kaishi Drill</h1>
          <p className="lede">Recall vocabulary by typing, or sharpen kana recognition independently.</p>
        </div>
        <div className="dashboard-actions">
          <Link className="button-link" to="/study">Study vocabulary</Link>
          <Link className="button-secondary" to="/kana">Practice Kana</Link>
        </div>
      </div>

      <div className="metric-grid" aria-label="Study summary">
        <article><span>Due reviews</span><strong>{model.dueVocabulary}</strong></article>
        <article><span>New cards available</span><strong>{model.newVocabularyAvailable}</strong></article>
        <article><span>Current streak</span><strong>{model.streakDays}<small> days</small></strong></article>
        <article><span>Today</span><strong>{model.today.vocabularyReviews + model.today.kanaAttempts}<small> attempts</small></strong></article>
      </div>

      <div className="dashboard-grid">
        <section className="dashboard-panel" aria-labelledby="activity-heading">
          <div className="panel-heading">
            <div><p className="eyebrow">Last 26 weeks</p><h2 id="activity-heading">Study activity</h2></div>
            <p><strong>{model.lifetimeVocabularyReviews.toLocaleString()}</strong> lifetime vocabulary reviews</p>
          </div>
          <div className="activity-scroll" tabIndex={0} aria-label="Scrollable activity calendar">
            <div className="activity-heatmap">
              {model.activity.map((cell) => {
                const total = cell.vocabularyReviews + cell.kanaAttempts;
                const level = total === 0 ? 0 : total < 3 ? 1 : total < 7 ? 2 : total < 15 ? 3 : 4;
                const label = activityLabel(cell);
                return (
                  <button
                    key={cell.localDate}
                    type="button"
                    className="activity-cell"
                    data-level={level}
                    aria-label={label}
                    title={label}
                    onClick={() => setSelectedActivity(label)}
                  />
                );
              })}
            </div>
          </div>
          <p className="activity-detail" aria-live="polite">{selectedActivity ?? "Choose a day for details."}</p>
        </section>

        <section className="dashboard-panel accuracy-panel" aria-labelledby="accuracy-heading">
          <p className="eyebrow">Typed vocabulary</p>
          <h2 id="accuracy-heading">Accuracy</h2>
          <strong className="accuracy-value">{Math.round(model.vocabularyAccuracy * 100)}%</strong>
          <p>Based on Kaishi Drill answers. Imported Anki reviews are included only in lifetime history.</p>
        </section>
      </div>

      <section className="dashboard-panel" aria-labelledby="future-due-heading">
        <div className="panel-heading">
          <div><p className="eyebrow">Next 14 days</p><h2 id="future-due-heading">Future Due</h2></div>
          <p>Scheduled now · New answers can change this estimate</p>
        </div>
        <div className="future-due-scroll" tabIndex={0} aria-label="14-day future due forecast">
          <ol className="future-due-chart">
            {model.futureDue.map((day) => {
              const maximum = Math.max(1, ...model.futureDue.map((candidate) => candidate.reviews));
              const scale = day.reviews / maximum;
              const label = `${dateLabel(day.localDate)}: ${day.reviews} reviews`;
              return (
                <li key={day.localDate} aria-label={label} title={label}>
                  <div className="future-due-bar" aria-hidden="true">
                    <span
                      data-has-reviews={day.reviews > 0}
                      style={{ "--forecast-scale": scale } as CSSProperties}
                    />
                  </div>
                  <strong>{day.reviews}</strong>
                  <time dateTime={day.localDate}>{shortDateLabel(day.localDate)}</time>
                </li>
              );
            })}
          </ol>
        </div>
      </section>

      <section className="dashboard-panel" aria-labelledby="weak-kana-heading">
        <div className="panel-heading">
          <div><p className="eyebrow">Focus mode</p><h2 id="weak-kana-heading">Kana to revisit</h2></div>
          <Link to="/kana">Open Kana Trainer</Link>
        </div>
        {model.weakKana.length > 0 ? (
          <ul className="weak-kana-list">
            {model.weakKana.map((skill) => (
              <li key={skill.id}>
                <span lang="ja">{skill.id.split(":").slice(1).join(":")}</span>
                <small>{skill.attempts - skill.correct} errors · {skill.attempts} attempts</small>
              </li>
            ))}
          </ul>
        ) : <p>No Kana mistakes recorded yet.</p>}
      </section>
    </section>
  );
}

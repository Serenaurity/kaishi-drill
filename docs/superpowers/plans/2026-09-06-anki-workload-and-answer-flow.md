# Anki Workload and Answer Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preserve Kaishi's Anki New-card order, expose Anki-compatible daily limits and Future Due data, accept individual English glosses, show sentence/audio before answering, and correct the Kana Enter flow.

**Architecture:** Keep scheduling and ordering in deterministic domain services, persist user limits through the existing settings table, and render only derived view models in React. Imported Anki `cards.due` becomes optional provenance on each generated skill card; the scheduler remains FSRS-backed and unchanged.

**Tech Stack:** React 19, TypeScript 5.9 strict mode, Dexie 4/IndexedDB, ts-fsrs 5.2.3, Vitest/Testing Library, Playwright, Vite 7.

**Spec:** `docs/superpowers/specs/2026-09-05-kaishi-drill-standalone-webapp-design.md`

**Status (2026-09-07):** Tasks 1–7 are implemented and validated. Commit checkpoints remain intentionally deferred until the user requests commit/push.

## Global Constraints

- Daily New and review limits count Kaishi skill cards, matching Anki card-count semantics.
- Defaults remain exactly `20` New cards/day and `200` reviews/day; `0` pauses the category.
- New cards follow ascending imported Anki `cards.due`; Reading and Meaning siblings remain separated when another card is available.
- Imported informational notes with no Reading or Meaning remain stored but do not generate skill cards.
- No audio autoplay and no network dependency.
- Future Due covers the next 14 local calendar days, excludes New and currently overdue cards, and is labeled as an estimate.
- User `.apkg` data and private acceptance output remain gitignored.
- Do not commit or push during this execution unless the user explicitly requests it.

---

### Task 1: Preserve and use imported Anki New positions

**Files:**
- Modify: `src/domain/models.ts`
- Modify: `src/features/import/progress-initializer.ts`
- Test: `src/features/import/progress-initializer.test.ts`
- Modify: `src/features/study/queue.ts`
- Test: `src/features/study/queue.test.ts`

**Interfaces:**
- Produces: `SkillCardRecord.sourceNewPosition?: number`.
- Consumes: `ImportedAnkiCardRecord.state`, `queue`, and `due`.
- Queue fallback: stable `sourceAnkiCardId`, then skill-card `id`.

- [ ] **Step 1: Write failing provenance and queue tests**

```ts
expect(cards.map((card) => card.sourceNewPosition)).toEqual([3, 3, 4, 4]);
expect(buildStudyQueue(input(cards, schedules))).toEqual([
  "first:reading", "second:reading", "first:meaning", "second:meaning",
]);
```

Also add a note with blank Reading/Meaning and assert that initialization creates no skill cards for it.

- [ ] **Step 2: Run focused tests and verify failure**

Run: `npm test -- --run src/features/import/progress-initializer.test.ts src/features/study/queue.test.ts`

Expected: FAIL because `sourceNewPosition` is absent and New cards are hash-sorted.

- [ ] **Step 3: Add position provenance and ordered New comparison**

```ts
export interface SkillCardRecord {
  id: string;
  noteId: string;
  sourceAnkiCardId: string;
  sourceNewPosition?: number;
  skill: Skill;
  createdAt: string;
}

function validNewPosition(card?: ImportedAnkiCardRecord): number | undefined {
  return card?.state === 0 && Number.isSafeInteger(card.due) && card.due >= 0
    ? card.due
    : undefined;
}
```

Sort New queue items by `sourceNewPosition`, then numeric/string source identity, and preserve sibling separation.
Filter notes without both a non-empty Reading and a non-empty Meaning before generating skill cards.

- [ ] **Step 4: Run focused tests and verify pass**

Run: `npm test -- --run src/features/import/progress-initializer.test.ts src/features/study/queue.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit checkpoint (deferred in this run)**

```bash
git add src/domain/models.ts src/features/import/progress-initializer.ts src/features/import/progress-initializer.test.ts src/features/study/queue.ts src/features/study/queue.test.ts
git commit -m "feat: preserve Anki new card order"
```

### Task 2: Accept independent English glosses

**Files:**
- Modify: `src/features/study/grading/english.ts`
- Test: `src/features/study/grading/english.test.ts`

**Interfaces:**
- Produces: `deriveEnglishAliases(gloss: string): string[]` with comma, semicolon, slash, full-width delimiter, pipe, and optional infinitive aliases.
- Consumes: existing `gradeEnglish(answer, aliases)` exact/close rules.

- [ ] **Step 1: Write failing alias tests**

```ts
expect(deriveEnglishAliases("lover, sweetheart")).toEqual(["lover", "sweetheart"]);
for (const answer of ["to welcome", "welcome", "to go out to meet", "go out to meet", "to invite", "invite"]) {
  expect(gradeEnglish(answer, deriveEnglishAliases("to welcome, to go out to meet, to invite")).grade).toBe("correct");
}
```

- [ ] **Step 2: Run test and verify failure**

Run: `npm test -- --run src/features/study/grading/english.test.ts`

Expected: FAIL because ASCII commas do not split aliases.

- [ ] **Step 3: Split glosses before adding conservative infinitive variants**

```ts
const explicit = gloss
  .normalize("NFKC")
  .replace(/\([^)]*\)/g, " ")
  .split(/[;,，；/／|]+/)
  .map(normalizeEnglish)
  .filter(Boolean);
const aliases = explicit.flatMap((value) =>
  value.startsWith("to ") && value.length > 3 ? [value, value.slice(3)] : [value]
);
```

- [ ] **Step 4: Run test and verify pass**

Run: `npm test -- --run src/features/study/grading/english.test.ts`

Expected: PASS without changing keyword-overlap or typo behavior.

- [ ] **Step 5: Commit checkpoint (deferred in this run)**

```bash
git add src/features/study/grading/english.ts src/features/study/grading/english.test.ts
git commit -m "fix: accept alternative English glosses"
```

### Task 3: Move sentence and audio controls to the prompt

**Files:**
- Modify: `src/features/study/components/PromptCard.tsx`
- Test: `src/features/study/components/PromptCard.test.tsx`
- Modify: `src/features/study/components/AnswerFeedback.tsx`
- Modify: `src/features/study/StudyPage.tsx`
- Test: `src/features/study/StudyPage.test.tsx`
- Modify: `src/styles/app.css`

**Interfaces:**
- Consumes: `NoteRecord.sentence`, `wordAudioMediaId`, `sentenceAudioMediaId` and `MediaRepository`.
- Produces: one persistent pre-answer audio row and sentence block; answer feedback no longer owns media playback.

- [ ] **Step 1: Write failing prompt visibility tests**

```tsx
expect(screen.getByText("これは例文です")).toBeVisible();
expect(screen.getByRole("button", { name: "Play word audio" })).toBeVisible();
expect(screen.getByRole("button", { name: "Play sentence audio" })).toBeVisible();
```

- [ ] **Step 2: Run focused component tests and verify failure**

Run: `npm test -- --run src/features/study/components/PromptCard.test.tsx src/features/study/StudyPage.test.tsx`

Expected: FAIL because sentence and audio currently live after reveal.

- [ ] **Step 3: Render prompt context and remove duplicate answer controls**

```tsx
{prompt.note.sentence && <p className="prompt-sentence" lang="ja">{prompt.note.sentence}</p>}
<div className="audio-row" aria-label="Pronunciation">
  <AudioButton label="Play word audio" mediaId={prompt.note.wordAudioMediaId} repository={repository} />
  <AudioButton label="Play sentence audio" mediaId={prompt.note.sentenceAudioMediaId} repository={repository} />
</div>
```

Remove `repository` from `AnswerFeedbackProps`, remove its audio row, and update the Study page call site. Keep disabled/unavailable behavior inside `AudioButton`.

- [ ] **Step 4: Run focused tests and verify pass**

Run: `npm test -- --run src/features/study/components/PromptCard.test.tsx src/features/study/StudyPage.test.tsx`

Expected: PASS with exactly one of each audio control before and after reveal.

- [ ] **Step 5: Commit checkpoint (deferred in this run)**

```bash
git add src/features/study/components/PromptCard.tsx src/features/study/components/PromptCard.test.tsx src/features/study/components/AnswerFeedback.tsx src/features/study/StudyPage.tsx src/features/study/StudyPage.test.tsx src/styles/app.css
git commit -m "feat: show sentence and audio before answering"
```

### Task 4: Persist Anki-compatible daily limits

**Files:**
- Modify: `src/storage/repositories.ts`
- Create: `src/storage/repositories.test.ts`
- Modify: `src/features/settings/SettingsPage.tsx`
- Test: `src/features/settings/SettingsPage.test.tsx`
- Modify: `src/styles/app.css`

**Interfaces:**
- Produces: `setStudyLimits(db: KaishiDb, limits: StudyLimits): Promise<void>`.
- UI `SettingsActions` produces `loadStudyLimits()` and `saveStudyLimits(limits)`.
- Valid range: integer `0..9999`; invalid data rejects without partially saving.

- [ ] **Step 1: Write failing repository and settings-form tests**

```ts
await setStudyLimits(db, { newPerDay: 40, reviewsPerDay: 300 });
await expect(getStudyLimits(db)).resolves.toEqual({ newPerDay: 40, reviewsPerDay: 300 });
expect(screen.getByLabelText("New cards per day")).toHaveValue(20);
expect(screen.getByLabelText("Maximum reviews per day")).toHaveValue(200);
```

- [ ] **Step 2: Run focused tests and verify failure**

Run: `npm test -- --run src/storage/repositories.test.ts src/features/settings/SettingsPage.test.tsx`

Expected: FAIL because limits are read-only and Settings has no study form.

- [ ] **Step 3: Add atomic validation/persistence and accessible controls**

```ts
export async function setStudyLimits(db: KaishiDb, limits: StudyLimits): Promise<void> {
  for (const [label, value] of Object.entries(limits)) {
    if (!Number.isInteger(value) || value < 0 || value > 9999) throw new Error(`${label} must be between 0 and 9999`);
  }
  await db.settings.bulkPut([
    { key: "dailyNewLimit", value: limits.newPerDay },
    { key: "dailyReviewLimit", value: limits.reviewsPerDay },
  ]);
}
```

Render a `Study limits` form with visible labels, helper copy explaining card semantics, Reset-to-20/200 action, inline validation, busy state, and a live saved message.

- [ ] **Step 4: Run focused tests and verify pass**

Run: `npm test -- --run src/storage/repositories.test.ts src/features/settings/SettingsPage.test.tsx`

Expected: PASS.

- [ ] **Step 5: Commit checkpoint (deferred in this run)**

```bash
git add src/storage/repositories.ts src/storage/repositories.test.ts src/features/settings/SettingsPage.tsx src/features/settings/SettingsPage.test.tsx src/styles/app.css
git commit -m "feat: add daily study limit settings"
```

### Task 5: Add a 14-day Future Due forecast

**Files:**
- Modify: `src/features/dashboard/dashboard-service.ts`
- Test: `src/features/dashboard/dashboard-service.test.ts`
- Modify: `src/features/dashboard/DashboardPage.tsx`
- Test: `src/features/dashboard/DashboardPage.test.tsx`
- Modify: `src/styles/app.css`

**Interfaces:**
- Produces: `DashboardModel.futureDue: Array<{ localDate: string; reviews: number }>` with exactly 14 entries starting tomorrow.
- Consumes: non-New `ScheduleRecord.dueAt`, current time, and requested IANA timezone.

- [ ] **Step 1: Write failing service and rendering tests**

```ts
expect(model.futureDue).toHaveLength(14);
expect(model.futureDue[0]).toEqual({ localDate: "2026-09-06", reviews: 2 });
expect(screen.getByRole("heading", { name: "Future Due" })).toBeVisible();
expect(screen.getByText(/scheduled now/i)).toBeVisible();
```

- [ ] **Step 2: Run focused tests and verify failure**

Run: `npm test -- --run src/features/dashboard/dashboard-service.test.ts src/features/dashboard/DashboardPage.test.tsx`

Expected: FAIL because the model has no forecast.

- [ ] **Step 3: Aggregate future schedules by local calendar date**

```ts
const futureDates = Array.from({ length: 14 }, (_, index) => shiftLocalDate(todayDate, index + 1));
const counts = new Map(futureDates.map((date) => [date, 0]));
for (const schedule of schedules) {
  if (schedule.state === "new" || Date.parse(schedule.dueAt) <= nowTime) continue;
  const date = localDateInTimeZone(new Date(schedule.dueAt), timezone);
  if (counts.has(date)) counts.set(date, counts.get(date)! + 1);
}
```

Render accessible bars with visible counts and date labels. Set bar height/width from the maximum using a CSS custom property, while retaining text so color/size is not the only signal.

- [ ] **Step 4: Run focused tests and verify pass**

Run: `npm test -- --run src/features/dashboard/dashboard-service.test.ts src/features/dashboard/DashboardPage.test.tsx`

Expected: PASS across the Bangkok UTC-midnight boundary.

- [ ] **Step 5: Commit checkpoint (deferred in this run)**

```bash
git add src/features/dashboard/dashboard-service.ts src/features/dashboard/dashboard-service.test.ts src/features/dashboard/DashboardPage.tsx src/features/dashboard/DashboardPage.test.tsx src/styles/app.css
git commit -m "feat: show future review forecast"
```

### Task 6: Correct Kana submit/continue behavior

**Files:**
- Modify: `src/features/kana/KanaPage.tsx`
- Test: `src/features/kana/KanaPage.test.tsx`
- Test: `tests/e2e/kana.spec.ts`

**Interfaces:**
- Correct answer: save, load next entry, clear input/grade, restore input focus.
- Incorrect answer: retain current entry and feedback; form submission while feedback is visible calls `next()`.

- [ ] **Step 1: Write failing interaction tests**

```ts
await user.type(screen.getByLabelText("Romaji"), accepted);
await user.keyboard("{Enter}");
await waitFor(() => expect(screen.getByLabelText("Romaji")).toHaveValue(""));

await user.type(screen.getByLabelText("Romaji"), "wrong");
await user.keyboard("{Enter}");
expect(screen.getByRole("heading", { name: "Incorrect" })).toBeVisible();
await user.keyboard("{Enter}");
await waitFor(() => expect(screen.queryByRole("heading", { name: "Incorrect" })).not.toBeInTheDocument());
```

- [ ] **Step 2: Run focused test and verify failure**

Run: `npm test -- --run src/features/kana/KanaPage.test.tsx`

Expected: FAIL because correct answers stop at feedback and Enter cannot activate the current `type="button"` Next control.

- [ ] **Step 3: Make the form state-driven**

```ts
async function submit(event: FormEvent<HTMLFormElement>) {
  event.preventDefault();
  if (grade) {
    await next();
    return;
  }
  const result = await session.answer(answer, elapsed);
  if (result.correct) await loadNextEntry(session);
  else setGrade(result);
}
```

Keep Next available for pointer users after an incorrect answer, but make it a submit control so Enter follows the same path.

- [ ] **Step 4: Run focused unit and E2E tests**

Run: `npm test -- --run src/features/kana/KanaPage.test.tsx`

Expected: PASS.

Run later with the full E2E suite in Task 7.

- [ ] **Step 5: Commit checkpoint (deferred in this run)**

```bash
git add src/features/kana/KanaPage.tsx src/features/kana/KanaPage.test.tsx tests/e2e/kana.spec.ts
git commit -m "fix: streamline Kana answer flow"
```

### Task 7: Integrate, validate, and document Phase 3 behavior

**Files:**
- Modify: `README.md`
- Modify: `docs/acceptance/private-deck-checklist.md`
- Modify: `tests/e2e/import-study.spec.ts`
- Modify: `tests/e2e/kana.spec.ts`
- Modify: `tests/e2e/accessibility.spec.ts` only if the new controls require explicit coverage

**Interfaces:**
- Consumes all features from Tasks 1–6.
- Produces a verified production build and browser behavior at `/study`, `/settings`, and `/`.

- [ ] **Step 1: Add E2E assertions for prompt context, gloss alternatives, settings persistence, Future Due copy, and Kana transitions**

```ts
await expect(page.getByRole("button", { name: "Play word audio" })).toBeVisible();
await expect(page.getByRole("button", { name: "Play sentence audio" })).toBeVisible();
await page.getByLabel("New cards per day").fill("40");
await page.getByRole("button", { name: "Save study limits" }).click();
await expect(page.getByText("Study limits saved.")).toBeVisible();
```

- [ ] **Step 2: Update user-facing documentation and private acceptance facts**

Document card-count semantics, default limits, Future Due caveat, pre-answer sentence/audio, English alternatives, all-New private package state, unique positions `3..1504` with missing `1380`, and media totals.

- [ ] **Step 3: Run static and automated validation**

Run: `npm run typecheck`

Expected: exit code 0.

Run: `npm run test:run`

Expected: all unit/integration tests pass.

Run: `npm run test:e2e`

Expected: all Playwright tests pass.

Run: `npm run build`

Expected: production build succeeds and the PWA manifest/service worker are generated.

- [ ] **Step 4: Inspect the aggregate diff and private-data boundary**

Run: `git diff --check`

Expected: no whitespace errors.

Run: `git status --short --ignored private-data/Kaishi.1.5k.apkg`

Expected: the package is ignored and not staged.

- [ ] **Step 5: Commit checkpoint (deferred in this run)**

```bash
git add README.md docs/acceptance/private-deck-checklist.md tests/e2e/import-study.spec.ts tests/e2e/kana.spec.ts tests/e2e/accessibility.spec.ts
git commit -m "feat: complete Anki-compatible Phase 3 study controls"
```

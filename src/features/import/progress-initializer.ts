import type {
  ImportMode,
  ImportedAnkiCardRecord,
  ScheduleRecord,
  SkillCardRecord,
} from "../../domain/models";
import type { KaishiDb } from "../../storage/db";
import { createNewSchedule } from "../study/scheduler";

export interface ProgressInitRequest {
  deckId: string;
  mode: ImportMode;
  now: Date;
}

export interface ProgressInitReport {
  skillCardsCreated: number;
  seededSchedules: number;
  importedReviews: number;
  warnings: string[];
}

function validMemoryState(card: ImportedAnkiCardRecord): boolean {
  return (
    typeof card.stability === "number" &&
    Number.isFinite(card.stability) &&
    card.stability > 0 &&
    typeof card.difficulty === "number" &&
    Number.isFinite(card.difficulty) &&
    card.difficulty >= 1 &&
    card.difficulty <= 10
  );
}

function stateFromAnki(value: number): ScheduleRecord["state"] {
  if (value === 1) return "learning";
  if (value === 2) return "review";
  if (value === 3) return "relearning";
  return "new";
}

function newPositionFromAnki(card?: ImportedAnkiCardRecord): number | undefined {
  return card?.state === 0 && Number.isSafeInteger(card.due) && card.due >= 0
    ? card.due
    : undefined;
}

function dueFromAnkiCard(card: ImportedAnkiCardRecord, importedAt: Date): Date {
  if ((card.state === 1 || card.state === 3) && card.due > 1_000_000_000) {
    const due = new Date(card.due * 1_000);
    if (!Number.isNaN(due.getTime())) return due;
  }
  if (card.lastReviewAt) {
    const lastReview = new Date(card.lastReviewAt);
    if (!Number.isNaN(lastReview.getTime())) {
      return new Date(lastReview.getTime() + Math.max(0, card.interval) * 86_400_000);
    }
  }
  return importedAt;
}

export function seedFromAnkiCard(
  card: ImportedAnkiCardRecord,
  skillCardId: string,
  importedAt: Date,
): ScheduleRecord {
  const base = createNewSchedule(skillCardId, importedAt);
  if (card.state === 0 && card.reps === 0) {
    return {
      ...base,
      reps: card.reps,
      lapses: card.lapses,
      seededFromAnki: true,
    };
  }
  if (!validMemoryState(card)) return base;

  const lastReview = card.lastReviewAt ? new Date(card.lastReviewAt) : undefined;
  const elapsedDays = lastReview && !Number.isNaN(lastReview.getTime())
    ? Math.max(0, Math.floor((importedAt.getTime() - lastReview.getTime()) / 86_400_000))
    : Math.max(0, card.interval);
  return {
    ...base,
    state: stateFromAnki(card.state),
    dueAt: dueFromAnkiCard(card, importedAt).toISOString(),
    stability: card.stability!,
    difficulty: card.difficulty!,
    elapsedDays,
    scheduledDays: Math.max(0, card.interval),
    reps: Math.max(0, card.reps),
    lapses: Math.max(0, card.lapses),
    lastReviewAt: lastReview && !Number.isNaN(lastReview.getTime())
      ? lastReview.toISOString()
      : undefined,
    seededFromAnki: true,
  };
}

export async function initializeProgress(
  request: ProgressInitRequest,
  db: KaishiDb,
): Promise<ProgressInitReport> {
  const [deck, imported, notes, sourceCards] = await Promise.all([
    db.decks.get(request.deckId),
    db.imports.get(request.deckId),
    db.notes.where("deckId").equals(request.deckId).sortBy("ankiNoteId"),
    db.ankiCards.where("deckId").equals(request.deckId).toArray(),
  ]);
  if (!deck || !imported) throw new Error("The imported deck could not be found");
  if (request.mode === "continue" && !imported.schedulingAvailable) {
    throw new Error("Continue requires scheduling information from Anki");
  }

  const noteIds = new Set(notes.map((note) => note.id));
  const existingSkillCards = await db.skillCards
    .filter((card) => noteIds.has(card.noteId))
    .toArray();
  if (existingSkillCards.length > 0) {
    if (deck.importMode !== request.mode) {
      throw new Error("Progress is already initialized in a different mode; reset or reimport first");
    }
    const existingIds = new Set(existingSkillCards.map((card) => card.id));
    const schedules = await db.schedules.filter((value) => existingIds.has(value.skillCardId)).toArray();
    return {
      skillCardsCreated: 0,
      seededSchedules: schedules.filter((value) => value.seededFromAnki).length,
      importedReviews: await db.ankiReviews.where("deckId").equals(request.deckId).count(),
      warnings: [],
    };
  }

  const sourceByNote = new Map(sourceCards.map((card) => [card.noteId, card]));
  const skillCards: SkillCardRecord[] = [];
  const schedules: ScheduleRecord[] = [];
  const warnings: string[] = [];
  const initializedAt = Number.isNaN(new Date(deck.importedAt).getTime())
    ? request.now
    : new Date(deck.importedAt);

  for (const note of notes) {
    const source = sourceByNote.get(note.id);
    if (!note.reading.trim() || !note.meaning.trim()) continue;
    for (const skill of ["reading", "meaning"] as const) {
      const id = `${note.id}:${skill}`;
      skillCards.push({
        id,
        noteId: note.id,
        sourceAnkiCardId: source?.sourceAnkiCardId ?? "",
        sourceNewPosition: newPositionFromAnki(source),
        skill,
        createdAt: request.now.toISOString(),
      });
      if (request.mode === "continue" && source) {
        const seeded = seedFromAnkiCard(source, id, initializedAt);
        schedules.push(seeded);
        if ((source.state !== 0 || source.reps > 0) && !seeded.seededFromAnki) {
          warnings.push(`Invalid memory state for card ${source.sourceAnkiCardId}; started as New.`);
        }
      } else {
        schedules.push(createNewSchedule(id, initializedAt));
      }
    }
    if (request.mode === "continue" && !source) {
      warnings.push(`No source Anki card for note ${note.ankiNoteId}; started as New.`);
    }
  }

  const uniqueWarnings = [...new Set(warnings)].sort();
  await db.transaction(
    "rw",
    [db.skillCards, db.schedules, db.ankiReviews, db.decks, db.imports],
    async () => {
      await db.skillCards.bulkPut(skillCards);
      await db.schedules.bulkPut(schedules);
      if (request.mode === "fresh") {
        await db.ankiReviews.where("deckId").equals(request.deckId).delete();
      }
      await db.decks.update(request.deckId, { importMode: request.mode });
      await db.imports.update(request.deckId, { importMode: request.mode });
    },
  );

  return {
    skillCardsCreated: skillCards.length,
    seededSchedules: schedules.filter((schedule) => schedule.seededFromAnki).length,
    importedReviews: await db.ankiReviews.where("deckId").equals(request.deckId).count(),
    warnings: uniqueWarnings,
  };
}

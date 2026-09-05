import Dexie, { type EntityTable } from "dexie";
import type {
  DailyActivityRecord,
  DeckRecord,
  ImportedAnkiCardRecord,
  ImportedAnkiReviewRecord,
  ImportRecord,
  KanaSkillRecord,
  MediaRecord,
  NoteRecord,
  ReviewEventRecord,
  ScheduleRecord,
  SettingRecord,
  SkillCardRecord,
} from "../domain/models";

export class KaishiDb extends Dexie {
  decks!: EntityTable<DeckRecord, "id">;
  notes!: EntityTable<NoteRecord, "id">;
  ankiCards!: EntityTable<ImportedAnkiCardRecord, "id">;
  skillCards!: EntityTable<SkillCardRecord, "id">;
  schedules!: EntityTable<ScheduleRecord, "skillCardId">;
  reviewEvents!: EntityTable<ReviewEventRecord, "id">;
  ankiReviews!: EntityTable<ImportedAnkiReviewRecord, "id">;
  media!: EntityTable<MediaRecord, "id">;
  kanaSkills!: EntityTable<KanaSkillRecord, "id">;
  dailyActivity!: EntityTable<DailyActivityRecord, "id">;
  imports!: EntityTable<ImportRecord, "id">;
  settings!: EntityTable<SettingRecord, "key">;

  constructor(name = "kaishi-drill") {
    super(name);
    this.version(1).stores({
      decks: "id, ankiDeckId, importedAt",
      notes: "id, deckId, ankiNoteId, [deckId+ankiNoteId]",
      ankiCards: "id, deckId, noteId, sourceAnkiCardId, [deckId+sourceAnkiCardId]",
      skillCards: "id, noteId, sourceAnkiCardId, [noteId+skill]",
      schedules: "skillCardId, dueAt, [state+dueAt], revision",
      reviewEvents: "id, skillCardId, occurredAt, localDate",
      ankiReviews: "id, deckId, sourceAnkiCardId, occurredAt",
      media: "id, deckId, filename, [deckId+filename]",
      kanaSkills: "id, lastWrongAt",
      dailyActivity: "id, localDate, [profileId+localDate]",
      imports: "id, packageSha256, importedAt",
      settings: "key",
    });
  }
}

export const openKaishiDb = (name?: string) => new KaishiDb(name);
export const deleteKaishiDb = (name: string) => Dexie.delete(name);

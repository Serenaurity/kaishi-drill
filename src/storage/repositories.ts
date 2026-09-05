import type { KaishiDb } from "./db";

export async function getActiveDeckId(db: KaishiDb): Promise<string | undefined> {
  const value = (await db.settings.get("activeDeckId"))?.value;
  return typeof value === "string" ? value : undefined;
}

export async function setActiveDeckId(db: KaishiDb, id: string): Promise<void> {
  await db.settings.put({ key: "activeDeckId", value: id });
}

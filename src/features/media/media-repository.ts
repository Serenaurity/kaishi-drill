import type { KaishiDb } from "../../storage/db";

export interface MediaRepository {
  getBlob(mediaId: string): Promise<Blob | undefined>;
}

export function createMediaRepository(db: KaishiDb): MediaRepository {
  return {
    async getBlob(mediaId) {
      return (await db.media.get(mediaId))?.blob;
    },
  };
}

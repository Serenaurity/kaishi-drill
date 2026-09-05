/// <reference lib="webworker" />

import { openKaishiDb, type KaishiDb } from "../../storage/db";
import { importPackage } from "./import-service";

type WorkerRequest =
  | { type: "start"; source: Blob; filename: string }
  | { type: "cancel" };

let controller: AbortController | undefined;
let database: KaishiDb | undefined;

async function digest(algorithm: "SHA-1" | "SHA-256", bytes: Uint8Array): Promise<string> {
  const value = await crypto.subtle.digest(algorithm, bytes.slice().buffer);
  return Array.from(new Uint8Array(value), (byte) => byte.toString(16).padStart(2, "0")).join(
    "",
  );
}

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  if (event.data.type === "cancel") {
    controller?.abort();
    return;
  }

  controller = new AbortController();
  database = openKaishiDb();
  try {
    const report = await importPackage(
      { source: event.data.source, filename: event.data.filename },
      {
        db: database,
        signal: controller.signal,
        now: () => new Date(),
        sha256: (bytes) => digest("SHA-256", bytes),
        sha1: (bytes) => digest("SHA-1", bytes),
        progress: (progress) => postMessage({ type: "progress", progress }),
      },
    );
    postMessage({ type: "complete", report });
  } catch (error) {
    postMessage({
      type: "error",
      name: error instanceof Error ? error.name : "Error",
      message: error instanceof Error ? error.message : "Import failed",
    });
  } finally {
    database.close();
    database = undefined;
    controller = undefined;
  }
};

import type { ImportProgress, ImportReport } from "./types";

export interface ImportClient {
  start(
    source: Blob,
    filename: string,
    onProgress: (progress: ImportProgress) => void,
  ): Promise<ImportReport>;
  cancel(): void;
}

type WorkerResponse =
  | { type: "progress"; progress: ImportProgress }
  | { type: "complete"; report: ImportReport }
  | { type: "error"; name?: string; message: string };

export function createImportClient(): ImportClient {
  let activeWorker: Worker | undefined;
  let rejectActive: ((reason: unknown) => void) | undefined;
  let forcedTermination: ReturnType<typeof setTimeout> | undefined;

  function finish(worker: Worker): void {
    if (forcedTermination) {
      clearTimeout(forcedTermination);
      forcedTermination = undefined;
    }
    worker.terminate();
    if (activeWorker === worker) {
      activeWorker = undefined;
      rejectActive = undefined;
    }
  }

  return {
    start(source, filename, onProgress) {
      if (activeWorker) {
        return Promise.reject(new Error("An import is already running"));
      }

      const worker = new Worker(new URL("./import-worker.ts", import.meta.url), {
        type: "module",
      });
      activeWorker = worker;
      return new Promise<ImportReport>((resolve, reject) => {
        rejectActive = reject;
        worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
          if (event.data.type === "progress") {
            onProgress(event.data.progress);
            return;
          }
          if (event.data.type === "complete") {
            finish(worker);
            resolve(event.data.report);
            return;
          }

          const error = new Error(event.data.message);
          error.name = event.data.name ?? "Error";
          finish(worker);
          reject(error);
        };
        worker.onerror = (event) => {
          event.preventDefault();
          finish(worker);
          reject(new Error(event.message || "The import worker stopped unexpectedly"));
        };
        worker.onmessageerror = () => {
          finish(worker);
          reject(new Error("The import worker returned an unreadable response"));
        };
        worker.postMessage({ type: "start", source, filename });
      });
    },
    cancel() {
      const worker = activeWorker;
      const reject = rejectActive;
      if (!worker || !reject) {
        return;
      }
      worker.postMessage({ type: "cancel" });
      reject?.(new DOMException("Import cancelled", "AbortError"));
      rejectActive = undefined;
      forcedTermination = setTimeout(() => finish(worker), 1_000);
    },
  };
}

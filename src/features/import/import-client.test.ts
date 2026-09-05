import { afterEach, describe, expect, it, vi } from "vitest";
import { createImportClient } from "./import-client";

class FakeWorker {
  static instances: FakeWorker[] = [];

  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  onmessageerror: (() => void) | null = null;
  readonly messages: unknown[] = [];
  terminated = false;

  constructor() {
    FakeWorker.instances.push(this);
  }

  postMessage(message: unknown) {
    this.messages.push(message);
  }

  terminate() {
    this.terminated = true;
  }
}

afterEach(() => {
  FakeWorker.instances = [];
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("import worker client", () => {
  it("rejects and terminates the pending import when cancelled", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("Worker", FakeWorker as unknown as typeof Worker);
    const client = createImportClient();
    const pending = client.start(new Blob(["package"]), "deck.apkg", () => undefined);
    const worker = FakeWorker.instances[0]!;

    client.cancel();

    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(worker.messages).toEqual([
      expect.objectContaining({ type: "start", filename: "deck.apkg" }),
      { type: "cancel" },
    ]);
    expect(worker.terminated).toBe(false);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(worker.terminated).toBe(true);
  });

  it("rejects worker runtime failures instead of leaving the UI waiting", async () => {
    vi.stubGlobal("Worker", FakeWorker as unknown as typeof Worker);
    const client = createImportClient();
    const pending = client.start(new Blob(["package"]), "deck.apkg", () => undefined);
    const worker = FakeWorker.instances[0]!;
    const preventDefault = vi.fn();

    worker.onerror?.({ message: "worker crashed", preventDefault } as unknown as ErrorEvent);

    await expect(pending).rejects.toThrow("worker crashed");
    expect(preventDefault).toHaveBeenCalled();
    expect(worker.terminated).toBe(true);
  });

  it("does not start a second worker while an import is active", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("Worker", FakeWorker as unknown as typeof Worker);
    const client = createImportClient();
    const first = client.start(new Blob(["package"]), "first.apkg", () => undefined);

    await expect(
      client.start(new Blob(["package"]), "second.apkg", () => undefined),
    ).rejects.toThrow(/already running/i);
    client.cancel();
    await expect(first).rejects.toMatchObject({ name: "AbortError" });
    expect(FakeWorker.instances).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1_000);
  });
});

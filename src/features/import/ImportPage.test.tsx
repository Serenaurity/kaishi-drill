import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { ImportClient } from "./import-client";
import { ImportPage } from "./ImportPage";
import type { ImportReport } from "./types";

describe("Import page", () => {
  it("states that import stays on this device", () => {
    render(<ImportPage />);
    expect(screen.getByText(/processed locally/i)).toBeVisible();
    expect(screen.getByLabelText(/anki package/i)).toHaveAttribute(
      "accept",
      ".apkg,.colpkg",
    );
  });

  it("focuses the package field and explains how to recover when it is empty", async () => {
    const user = userEvent.setup();
    render(<ImportPage />);
    await user.click(screen.getByRole("button", { name: /import package/i }));
    expect(screen.getByRole("alert")).toHaveTextContent(/choose an anki package/i);
    expect(screen.getByLabelText(/anki package/i)).toHaveFocus();
  });

  it("disables duplicate submission and offers cancellation while importing", async () => {
    const user = userEvent.setup();
    let rejectImport: ((reason: unknown) => void) | undefined;
    const client: ImportClient = {
      start: vi.fn(
        () =>
          new Promise<ImportReport>((_resolve, reject) => {
            rejectImport = reject;
          }),
      ),
      cancel: vi.fn(() => rejectImport?.(new DOMException("Cancelled", "AbortError"))),
    };
    render(<ImportPage client={client} />);
    await user.upload(
      screen.getByLabelText(/anki package/i),
      new File(["package"], "kaishi.apkg", { type: "application/zip" }),
    );
    await user.click(screen.getByRole("button", { name: /import package/i }));

    expect(screen.getByRole("button", { name: /importing/i })).toBeDisabled();
    expect(screen.getByLabelText(/anki package/i)).toBeDisabled();
    expect(screen.getByRole("progressbar", { name: /import progress/i })).toBeVisible();
    await user.click(screen.getByRole("button", { name: /cancel import/i }));
    expect(client.cancel).toHaveBeenCalled();
    expect(await screen.findByRole("alert")).toHaveTextContent(/cancelled/i);
  });
});

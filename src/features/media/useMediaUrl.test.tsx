import "@testing-library/jest-dom/vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import type { MediaRepository } from "./media-repository";
import { useMediaUrl } from "./useMediaUrl";

function MediaHarness({ mediaId, repository }: { mediaId?: string; repository: MediaRepository }) {
  const url = useMediaUrl(mediaId, repository);
  return <output>{url ?? "unavailable"}</output>;
}

beforeEach(() => {
  Object.defineProperty(URL, "createObjectURL", {
    configurable: true,
    value: vi.fn((blob: Blob) => `blob:${blob.size}:${Math.random()}`),
  });
  Object.defineProperty(URL, "revokeObjectURL", {
    configurable: true,
    value: vi.fn(),
  });
});

it("revokes the previous media URL when the card changes", async () => {
  const repository: MediaRepository = {
    getBlob: vi.fn().mockResolvedValue(new Blob(["media"])),
  };
  const view = render(<MediaHarness mediaId="first" repository={repository} />);
  await waitFor(() => expect(screen.getByText(/^blob:/)).toBeVisible());
  view.rerender(<MediaHarness mediaId="second" repository={repository} />);
  await waitFor(() => expect(URL.revokeObjectURL).toHaveBeenCalledTimes(1));
  view.unmount();
  expect(URL.revokeObjectURL).toHaveBeenCalledTimes(2);
});

it("does not create an object URL when media is unavailable", async () => {
  const repository: MediaRepository = { getBlob: vi.fn().mockResolvedValue(undefined) };
  render(<MediaHarness mediaId="missing" repository={repository} />);
  await waitFor(() => expect(repository.getBlob).toHaveBeenCalled());
  expect(URL.createObjectURL).not.toHaveBeenCalled();
  expect(screen.getByText("unavailable")).toBeVisible();
});

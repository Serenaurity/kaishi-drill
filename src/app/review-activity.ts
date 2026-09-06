let active = false;
const listeners = new Set<() => void>();

export function setReviewInteractionActive(next: boolean): void {
  if (active === next) return;
  active = next;
  for (const listener of listeners) listener();
}

export function subscribeToReviewActivity(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getReviewInteractionActive(): boolean {
  return active;
}

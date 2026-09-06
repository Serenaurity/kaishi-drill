import { useState, useSyncExternalStore } from "react";
import { useRegisterSW } from "virtual:pwa-register/react";
import {
  getReviewInteractionActive,
  subscribeToReviewActivity,
} from "./review-activity";

export function UpdatePrompt() {
  const [registrationError, setRegistrationError] = useState(false);
  const reviewActive = useSyncExternalStore(
    subscribeToReviewActivity,
    getReviewInteractionActive,
    getReviewInteractionActive,
  );
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    offlineReady: [offlineReady, setOfflineReady],
    updateServiceWorker,
  } = useRegisterSW({
    immediate: true,
    onRegisterError: () => setRegistrationError(true),
  });

  if (registrationError) {
    return <p className="pwa-notice pwa-notice-error" role="alert">Offline mode could not be prepared.</p>;
  }

  if (needRefresh && !reviewActive) {
    return (
      <aside className="pwa-notice" aria-labelledby="update-heading">
        <div>
          <strong id="update-heading">Update available</strong>
          <p>Apply it between answers so no typed response is interrupted.</p>
        </div>
        <div className="pwa-notice-actions">
          <button type="button" onClick={() => void updateServiceWorker(true)}>Update now</button>
          <button className="button-secondary" type="button" onClick={() => setNeedRefresh(false)}>Later</button>
        </div>
      </aside>
    );
  }

  if (offlineReady && !reviewActive) {
    return (
      <aside className="pwa-notice" aria-label="Offline status">
        <p><strong>Ready for offline study</strong></p>
        <button className="button-secondary" type="button" onClick={() => setOfflineReady(false)}>Dismiss</button>
      </aside>
    );
  }

  return null;
}

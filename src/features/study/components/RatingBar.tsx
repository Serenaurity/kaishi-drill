import type { Rating } from "../../../domain/models";
import type { GradeResult } from "../grading/types";
import type { SchedulePreview } from "../scheduler";

interface RatingBarProps {
  intervals: Record<Rating, SchedulePreview>;
  disabled: boolean;
  suggested?: GradeResult["suggestedRating"];
  onRate(rating: Rating): void;
}

const RATINGS: Array<{ rating: Rating; shortcut: string }> = [
  { rating: "again", shortcut: "1" },
  { rating: "hard", shortcut: "2" },
  { rating: "good", shortcut: "3" },
  { rating: "easy", shortcut: "4" },
];

function intervalLabel(preview: SchedulePreview): string {
  if (preview.scheduledDays === 0) return "soon";
  if (preview.scheduledDays === 1) return "1 day";
  return `${preview.scheduledDays.toLocaleString()} days`;
}

export function RatingBar({ intervals, disabled, suggested, onRate }: RatingBarProps) {
  return (
    <div className="rating-bar" role="group" aria-label="Rate this answer">
      {RATINGS.map(({ rating, shortcut }) => (
        <button
          key={rating}
          type="button"
          className={suggested === rating ? "rating-suggested" : "button-secondary"}
          disabled={disabled}
          onClick={() => onRate(rating)}
          aria-label={`${rating}, ${intervalLabel(intervals[rating])}`}
        >
          <span className="rating-name">{rating}</span>
          <span className="rating-interval">{intervalLabel(intervals[rating])}</span>
          <kbd>{shortcut}</kbd>
        </button>
      ))}
    </div>
  );
}

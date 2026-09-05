# Kaishi Drill Design System

**Project:** Kaishi Drill
**Direction:** Adult Japanese study tool; minimal Swiss/editorial; keyboard-first
**Design dials:** Variance 3/10, motion 1/10, density 6/10

This file is the product-wide source of truth. A file in `pages/` may override it for one route.

## Principles

- The study prompt is always the visual focus.
- Information appears progressively: prompt, submitted answer, explanation, then rating.
- The interface feels calm and precise rather than playful or game-like.
- Every action is usable with a keyboard and a 44x44px pointer target.
- Color reinforces meaning but never carries meaning alone.
- Imported deck media retains its aspect ratio and never shifts the answer controls.

## Color tokens

| Role | Light | Dark |
|---|---:|---:|
| Background | `#F6F4EF` | `#171816` |
| Surface | `#FFFEFB` | `#20211F` |
| Elevated surface | `#FFFFFF` | `#282927` |
| Text | `#1C1B19` | `#F4F1EA` |
| Muted text | `#65625C` | `#B9B5AD` |
| Border | `#D8D3C9` | `#4B4C47` |
| Primary | `#244E86` | `#8AB4F0` |
| Primary contrast | `#FFFFFF` | `#10233E` |
| Success | `#276442` | `#9FD5B4` |
| Warning | `#8A5A00` | `#E8B75D` |
| Error | `#A9362B` | `#FFB4AB` |
| Focus ring | `#2F6FEB` | `#A8C7FA` |

Use semantic CSS variables. Raw color values do not belong in React components.

## Typography

- Latin UI: `system-ui, -apple-system, "Segoe UI", sans-serif`.
- Japanese content: `"Noto Sans JP", "Yu Gothic UI", "Hiragino Sans", sans-serif`.
- Technical values: `ui-monospace, "Cascadia Code", "SFMono-Regular", monospace`.
- Do not load fonts from a CDN; the app must remain offline-first.
- Body: 16px/1.5. Labels: 14px/1.4. Prompt word: fluid 40–72px/1.15.
- Use weight and spacing for hierarchy; avoid all-caps body copy.

## Spacing and shape

```css
:root {
  --space-1: 0.25rem;
  --space-2: 0.5rem;
  --space-3: 0.75rem;
  --space-4: 1rem;
  --space-6: 1.5rem;
  --space-8: 2rem;
  --space-12: 3rem;
  --radius-sm: 6px;
  --radius-md: 10px;
  --radius-lg: 16px;
  --shadow-card: 0 1px 2px rgb(28 27 25 / 8%), 0 10px 30px rgb(28 27 25 / 5%);
}
```

- Maximum reading width: 72rem; maximum study-card width: 48rem.
- Borders are 1px. Avoid thick outlines, glass effects, gradients, and decorative shadows.
- Reserve image dimensions before loading to keep cumulative layout shift below 0.1.

## Components

### Navigation

- At most five primary destinations.
- Desktop uses a compact top bar; small screens use a bottom bar with safe-area padding.
- Every active destination has both text and a non-color marker.

### Buttons

- Minimum target: 44x44px; adjacent targets have at least 8px separation.
- Primary action is solid; secondary actions are bordered; tertiary actions are text-only.
- Disabled controls remain legible and expose the reason in nearby helper text.
- Use one SVG icon family; no emoji icons.

### Forms and import progress

- Always show a visible label; never use placeholder-only labels.
- Put validation text next to the affected control and move focus to the first blocking error after submit.
- Import uses named stages, a determinate count when known, cancel control, and an `aria-live="polite"` status.
- Keep the previously active deck available when import fails.

### Study card

- Prompt occupies the true center of the content column.
- The answer input remains in a stable position across prompt and reveal states.
- Feedback includes a text label: Correct, Close, or Incorrect.
- Rating controls appear only after reveal. Keyboard labels `1`–`4` are visible.
- Audio buttons have text labels and never autoplay unless enabled by the learner.

## Motion

- Use motion only to clarify state changes: 120–180ms opacity/color transitions.
- Do not animate width, height, or study-card position.
- Do not add scroll reveals, ambient motion, bounce, or idle wobble.
- Under `prefers-reduced-motion: reduce`, remove all non-essential transitions.

## Responsive and accessibility gates

- Verify 375px, 768px, 1024px, and 1440px widths without horizontal scrolling.
- Text contrast is at least 4.5:1; large text at least 3:1.
- Focus is visible and never hidden behind fixed navigation.
- Semantic headings, landmarks, labels, error associations, and live regions are required.
- Hover is an enhancement only; no feature depends on hover.
- Images have useful alt text or empty alt when decorative.
- Correctness, due state, and import warnings include text or icon shape in addition to color.

## Forbidden patterns

- Claymorphism, neumorphism, glassmorphism, gradients, and oversized rounded pills.
- Childlike display fonts or remote Google Font imports.
- Emoji used as interface icons.
- Hover transforms that move layout.
- Invisible focus rings, placeholder-only forms, and error summaries without field-level errors.
- Autoplay audio, blocking animations, or spinners without a text status.

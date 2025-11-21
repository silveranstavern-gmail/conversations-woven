# Core Style Guide

> TL;DR for agents
> - Pull colors/spacing/radii from tokens in `src/styles.css`; do not hard-code.
> - For actions, default to `appButton variant="ghost" size="sm"` for secondary header controls; use `primary` for main CTA, `danger` for destructive.
> - `appTooltip` only renders when the target is disabled; use it to explain disabled states, not for always-on help.
> - Import/Export pattern: hidden file input + two ghost/small buttons right-aligned in the header with matching tooltips.
> - Use `.surface-card` for cards, `.text-muted` for secondary text, `.visually-hidden` for SR-only labels.

This document codifies how styling stays centralized so the entire UI can be rethemed by touching a single layer—`src/styles.css`. Every component should pull from these tokens and utilities so we never hard‑code colors, spacing, or typography inside feature folders.

## Design Tokens (`src/styles.css`)

All colors use the `oklch()` color space for perceptual uniformity and better color mixing. Dark mode overrides live under `:root[data-theme='dark']`. When adding new tokens, define both light and dark values so the Theme panel stays in sync.

| Category | Tokens / Notes |
| --- | --- |
| Typography | `--font-sans` (Inter), `--font-mono` (JetBrains Mono), `--font-scale` (body size = `calc(14px * var(--font-scale))`). Legacy: `--font-family-sans`, `--font-family-mono` map to new names. |
| Color - Brand | `--color-brand`, `--color-brand-contrast`, `--color-brand-subtle`. Legacy: `--color-brand-strong` maps to `--color-brand`. |
| Color - Surfaces | `--color-base` (main app background), `--color-surface` (sidebar/cards), `--color-surface-hover`. Legacy: `--color-surface-{0-2}` map to base/surface/surface-hover. |
| Color - Borders | `--color-border`, `--color-border-hover`. |
| Color - Text | `--color-text` (primary), `--color-text-muted` (secondary). Legacy: `--color-muted`, `--color-text-strong` map to text-muted/text. |
| Color - Tooltips | `--color-tooltip-bg`, `--color-tooltip-text`, `--color-tooltip-border` (inverse of base for contrast). |
| Color - Feedback | `--color-danger`, `--color-danger-bg`. Legacy: `--color-accent` maps to `--color-danger`. |
| Elevation | `--shadow-xs`, `--shadow-sm`, `--shadow-md`. |
| Radii | `--radius-sm` (6px), `--radius-md` (8px), `--radius-lg` (12px), `--radius-pill` (9999px). Legacy: `--radius-xs` maps to `--radius-sm`. |
| Spacing | `--space-1` (0.25rem), `--space-2` (0.5rem), `--space-3` (0.75rem), `--space-4` (1rem), `--space-6` (1.5rem), `--space-8` (2rem). |
| Misc | `--container-max-width` (1600px), `--transition-base` (200ms cubic-bezier). |

## Theme + Font System

- `UserPreferencesService` manages theme preferences (`'system' | 'light' | 'dark'`) and toggles `data-theme` on `<html>`. When set to `'system'`, it automatically detects the user's OS preference via `prefers-color-scheme`.
- `UserPreferencesService` updates `--font-scale` on `<html>`, clamped between 0.8 and 1.5.
- Never change theme or font size inside components; instead, read the custom properties so user preferences cascade automatically.
- New theme variants should follow the same data attribute convention (`data-theme="contrast"`, etc.) and only modify CSS variables.

## Global Utilities & Patterns

### Cards
- `.surface-card` — shared background (`--color-surface`), border (`--color-border`), radius (`--radius-lg`), and shadow (`--shadow-xs`).

### Buttons
The button system uses `.ui-btn` as the base class with modifier classes for variants and sizes. Use the `appButton` directive (`button[appButton]` or `a[appButton]`) for programmatic styling, or apply classes directly.

**Base class:** `.ui-btn` — resets button styles, sets up flex layout, cursor, and base typography.

**Variants:**
- `.ui-btn--primary` — solid brand color background with contrast text
- `.ui-btn--secondary` — outlined/bordered style
- `.ui-btn--ghost` — no border, background on hover (default for many UI elements)
- `.ui-btn--danger` — red text/background for destructive actions

**Sizes:**
- `.ui-btn--sm` — small padding (0.25rem 0.6rem)
- `.ui-btn--md` — medium padding (0.5rem 1rem, default)
- `.ui-btn--icon` — square icon button (0.4rem padding, aspect-ratio: 1)

**Special states:** `.ui-btn--ghost.active` — active state with brand color tint.

**Directive defaults and usage:**
- `appButton` maps `variant`/`size` inputs to the modifier classes above; defaults are `variant="primary"` and `size="md"`.
- Allowed variants: `primary`, `secondary`, `ghost`, `danger`. Allowed sizes: `sm`, `md`, `icon`. Do not invent ad-hoc values.
- Prefer `variant="ghost"` for secondary, non-destructive actions (e.g., import/export affordances) so headers stay visually light.
- For destructive or high-risk flows, use `variant="danger"` and keep the action near context (avoid burying in overflow menus).

### Import/Export Action Pattern
- Placement: keep paired import/export actions inline on the far right of a section header (e.g., Backup & restore), not stacked under the description.
- Anatomy: use a hidden `<input type="file">` plus two `appButton` elements (`variant="ghost"`, `size="sm"`) in a row; avoid wrapping them in a card so they stay lightweight.
- Layout: align items center, use `flex` with a small gap (`var(--space-2)`), and let the left intro block flex so buttons stay right-aligned.
- Tooltips: favor `position="bottom"`/`"top"` with `size="md"` and `align="center"` for the pair to reduce visual noise.
- Behavior: clear the file input before triggering imports so repeat imports work, and keep buttons `white-space: nowrap` to prevent wrapping on narrow widths.

### Tooltip Directive Pattern
- `appTooltip` only renders when it detects a disabled target (either native `disabled` or `disabled` input). Use it to explain why an action is unavailable, not as a general helper tooltip.
- Inputs: `position` (`top`/`bottom`/`left`/`right`, default `top`), `align` (`start`/`center`/`end`, default `center`), `size` (`sm`/`md`/`lg`/`auto`, default `sm`), `message` for custom copy.
- State-aware helpers: `requiresUnlock`, `hasKeys`, `hasSelection`, `isEmpty`, `isProcessing` auto-derive messages; pass them instead of hard-coding strings when applicable.
- For button rows (e.g., import/export or bulk enable/disable), use consistent tooltip sizing and alignment to avoid jitter; keep the wrapper inline to preserve layout.

### Badges
- `.badge` — pill label with brand color background
- `.badge--neutral` — neutral gray background
- `.badge--ghost` — transparent with border
- `.badge--off` — used in models component for disabled features
- `.badge--new` — used in models component for new features

### Text Utilities
- `.text-muted` — applies `--color-text-muted` (secondary text color)

### Accessibility
- `.visually-hidden` — accessibility helper for screen reader-only content

Prefer these classes before creating new one-off variants. If a component needs a variant, compose with utilities rather than redefining colors.

## Component-Level Styling Checklist

1. **Use tokens**: colors, spacing, radii, shadows, typography should come from `var(--token)`.
2. **Scope selectors**: use `.component-name {}` + nested elements (BEM or utility-first) to avoid leaks.
3. **No inline magic numbers**: if a new constant is required multiple times, promote it to a CSS variable under `:root`.
4. **Respect layout primitives**: rely on flex/grid plus spacing tokens; avoid absolute positioning unless required for UX.
5. **Accessibility**: ensure focus states are visible—leverage color tokens and `outline` rather than removing focus rings.

Example:

```css
.toolbar {
  display: flex;
  gap: var(--space-3);
  padding: var(--space-3) var(--space-4);
  border-bottom: 1px solid var(--color-border);
}

.toolbar__button {
  /* Use ui-btn base class with variant */
  /* In template: <button class="ui-btn ui-btn--ghost"> or use appButton directive */
}
```

Or using the `appButton` directive in templates:

```html
<button appButton variant="ghost" size="sm">Action</button>
```

## Legacy Token Mappings

For backward compatibility, older token names are mapped to new ones. Prefer the new names in new code:

- `--font-family-sans` → `--font-sans`
- `--font-family-mono` → `--font-mono`
- `--color-surface-0` → `--color-base`
- `--color-surface-1` → `--color-surface`
- `--color-surface-2` → `--color-surface-hover`
- `--color-muted` → `--color-text-muted`
- `--color-text-strong` → `--color-text`
- `--color-brand-strong` → `--color-brand`
- `--color-accent` → `--color-danger`
- `--radius-xs` → `--radius-sm`

## Color System Details

### Color Format
All colors use the `oklch()` color space, which provides:
- Perceptual uniformity (equal steps in lightness/chroma/hue appear equally different)
- Better color mixing with `color-mix()` function
- Wide gamut support

### Color Mixing
The system uses `color-mix(in oklch, ...)` for semi-transparent overlays:
- Brand color overlays: `color-mix(in oklch, var(--color-brand) 30%, transparent)`
- Border overlays: `color-mix(in oklch, var(--color-border) 80%, transparent)`
- Active state tints: `color-mix(in oklch, var(--color-brand) 10%, transparent)`

### Default Form Styling
Inputs, textareas, and selects have default styling applied globally:
- Background: `--color-base`
- Border: `1px solid var(--color-border)`
- Border radius: `--radius-md`
- Focus state: `--color-brand` border with `--color-brand-subtle` shadow ring
- Transition: `--transition-base` for border-color and box-shadow

Components can override these defaults as needed, but should use the same tokens for consistency.

## Extending the System

1. Add/adjust tokens in `src/styles.css`.
2. Update dark‑mode overrides and (if relevant) Settings UI previews.
3. Use the new tokens in component styles; avoid duplicating fallback values.
4. Document any new primitives here so future contributors know how to reuse them.
5. When adding colors, use `oklch()` format and provide both light and dark theme values.
6. For semi-transparent overlays, use `color-mix(in oklch, ...)` with token colors.

## Quick Guardrails

- No `ngClass`/`ngStyle`; prefer static classes and `[class.foo]="condition"`.
- Keep `ChangeDetectionStrategy.OnPush` everywhere—styling changes should not rely on `NgZone`.
- When introducing new shared utilities, group them in `src/styles.css` (with comments) so future audits can find them quickly.

Following this guide ensures theming, typography, and spacing remain centralized and easy to tweak without chasing down per-component overrides.

# Visual QA — September 12, 2026

Tested the local Angular app in Chromium, with light and dark themes.

## Fixes

- Compact phone header and horizontally scrollable settings navigation.
- Settings grid sizing, model preset/filter wrapping, and backup header actions no longer squeeze text or overflow narrow screens.
- Tablet chat panels use mutually exclusive overlays through 1100px instead of squeezing the transcript between two 300px panels.
- Short windows let the transcript and composer scroll together, keeping the send control reachable.
- Composer setup guidance is a readable link, and drafts resize when the available width changes. Send button enlarged and attachment actions separated.
- Markdown styles now apply to generated HTML. Code wraps, tables have aligned columns and borders, and wide tables scroll within the message.
- Model selection stays synchronized when the asynchronous catalog loads; the Run Settings dropdown previously showed the first model while the composer showed the saved model.
- Active theme/message/model controls, model price spacing, conversation title truncation, and empty conversation copy improved.

## Verification

- Viewports: 320×568, 390×844, 768×1024, 820×900, 844×390, 1024×768, 1280×800, and 1440×900.
- Inspected chat, API keys, Models, model details dialog, System Prompts, Backup & Restore, and Theme & Font.
- Checked model settings at six widths from 320px through 1440px: no page or settings-content horizontal overflow. Navigation and wide Markdown tables intentionally scroll horizontally.
- Verified tablet panel exclusivity, long draft expansion/shrinking, and short-window composer access.
- Live request through `openrouter/free` succeeded and rendered a heading, bullets, table, and code block (132 reported output tokens).
- Removed the temporary key with the built-in **Clear → Clear all** workflow. The app confirmed all saved API keys were cleared and disabled Clear afterward. No credential was added to repository files.
- Production build passes with bundle/style budget warnings. All 29 Jasmine/Karma tests pass, including two new asynchronous model-selection regressions.

Changes are local; no deployment was performed. These are browser viewport checks, not physical-device or virtual-keyboard tests.

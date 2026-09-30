# CLAUDE.md — Miles Card App

**SPEC.md overrides any global or parent CLAUDE.md for this project** (including `~/Downloads/CLAUDE.md`). In particular:

- Plain HTML, CSS and JavaScript in several files. No Tailwind, no CDN scripts, no framework, no build step (the app must work offline).
- Ignore the parent screenshot/`serve.mjs` workflow unless those scripts are added to this project.
- Build in the stages in SPEC.md and check in after each one. Don't commit or push until asked.

## Decisions (from planning, 2026-09-30)

- `data/cards.json` uses schema v2 (one shape for every card). Card rules are never hardcoded.
- Miles are KrisFlyer only (HSBC uses its KrisFlyer rates).
- Posting delay is a setting, default 3 days. Show "may count next month" within that window of a reset.
- Round the whole purchase first, then split over a cap. Round down both parts.
- Maybank XL under S$500: rank at 4 mpd with a "needs S$X more this month" warning.
- UOB Visa Signature: rank at 0.4 until S$1,000 in the category ("4 mpd once S$X more is spent in this category"). Above S$1,200 only the excess earns 0.4 (Mainly Miles, Jul 2026), so it is an ordinary cap. `caps.*.hard_limit` stays in the engine for any card that does drop a whole category.
- Monthly-pooled rounding (SimplyGo on UOB, HSBC bonus): rank by miles over the month (`rankMiles`), show the exact per-purchase figure.
- Ranking ties: most cap left, then her priority order in My cards (default: order added). Cards that would break a hard limit go last.
- Catch-up entries: base rate, count against every cap unless she picks one. Offer only when statement > logged; otherwise just show the gap.
- Rules with no category codes match by category or merchant name, and are marked unconfirmed.
- A card with no `earn_block` rounds down each purchase to S$1, marked unconfirmed.
- Foreign currency: rank by miles; show the fee and cost per mile (fee ÷ miles).
- Points balances are stored with the date entered; only purchases after that date add to them.
- Default category codes in `data/categories.json` are guesses.
- `statement_day` and `annual_fee_date` are her data, stored in IndexedDB, not in `cards.json`.
- SimplyGo (MRT/bus): our engine is the authority. Never compare with KiasuMiles and never show the "Copy KiasuMiles prompt" button for simplygo purchases.
- KiasuMiles comparison: `npm run compare:kiasumiles` runs every profile in `tests/purchases.json` (`all`, `planned` = UOB Preferred Visa + Citi Rewards). Reviewed disagreements go in `tests/kiasumiles-decisions.json`; never change `cards.json` automatically.
- Time-limited rules use `valid_from`/`valid_until` (+ `promotion: true`); rules sources disagree on use `disputed` (rate kept, marked unconfirmed, note shown).
- She has no cards yet: the app starts with an empty wallet and she adds cards as they arrive.
- Theme: pink (accent #C8326E light / #FF8AB5 dark), amber for warnings, red for "avoid". Tokens live in `styles.css` `:root`.
- Reminders: statements 7 days ahead and unchecked statements for 10 days after; annual fees within 30 days either side (text from `fee_reminder` in cards.json); sign-up deadlines within 30 days; backup after 7 days.
- Backup import replaces everything in one IndexedDB transaction (all or nothing).
- Disputed rules (sources disagree): each `disputed` entry has an `id` and a `question`. Purchases relying on one show "check on statement"; the statement check asks her yes/no. Her answers live on the phone (`settings.disputeAnswers`) and apply at once (no = base rate for that merchant on that card). To carry them into cards.json: `node scripts/apply-dispute-answers.mjs <backup.json>` shows the diff; add `--apply` only after the user approves it.
- Subscriptions are an ordinary online category with `recurring: true` (not "no miles"). Rules with `match.exclude_recurring` (UOB Preferred Visa online) earn base on them; Citi Rewards online has a `recurring: true` dispute ("check on statement"). The other no-miles categories stay no-miles.
- When the service worker fetches a changed file (e.g. `data/cards.json`), or a new worker takes over, the page shows "Updated, tap to reload".
- Offline: `sw.js` precaches every app file (stale-while-revalidate). When adding a file under `src/`, add it to `FILES` in `sw.js`; `tests/sw.test.js` fails otherwise. Bump `CACHE` only to force-drop old caches.
- Hosting: GitHub Pages serves the repo root; all paths are relative so it works under `/<repo>/`.

## Writing style

Applies to every string she sees: screens, sheets, toasts, reminders, engine reasons and warnings, and the text fields in `data/cards.json` and `data/categories.json` that the app shows (`label`, `notes`, `fee_notes`, `fee_reminder`, `gotchas`, `points_expiry`, `condition`, `disputed[].note`/`question`, cap `label`s). Developer-only detail in cards.json goes in `dev_notes`, which the app never shows.

- Sentence case everywhere: capitalise only the first word and proper nouns (bank, card and merchant names, MRT, SimplyGo). No ALL CAPS for emphasis.
- Full sentences end with a period: hints, notes, warnings, reason lines and sentence bullets. Labels, buttons, chips, category names, titles and single values don't.
- Use " / " for alternatives. No "&" and no parentheses in names (e.g. "Pharmacy / health and beauty", "Online marketplaces").
- Money always has thousands separators: S$1,000.
- User-facing text says "category code", never "MCC". Don't show code numbers or ranges except in the category code field.
- Dates as "30 Sep 2026". Sources as linked text ("Mainly Miles review"), never a raw URL.

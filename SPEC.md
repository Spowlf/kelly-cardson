# Miles Card App: Build Spec

Build a personal credit card miles app for one user in Singapore. She uses it at the till to pick which card to pay with, and logs each purchase so the app knows how much bonus cap each card has left.

Before writing any code: read this whole file and `data/cards.json`, propose a plan and data model, and ask me any questions. Build in the stages at the bottom, and check in with me after each one.

## Ground rules

- Plain HTML, CSS and JavaScript. No framework, no build step, no backend.
- Installable PWA (manifest + service worker) that works offline, hosted on GitHub Pages, added to her iPhone home screen.
- All her data stays on her phone in IndexedDB.
- Never store card numbers, expiry dates or CVVs. Cards are identified by name only.
- Card rules live in `data/cards.json` and are never hardcoded. Banks change terms often, so updating a rate or cap must only mean editing that file.
- Mobile-first: big touch targets, readable at a glance.

## Card data (`data/cards.json`)

This file already exists. Read its `_meta` section first: it defines payment methods, rounding types and warnings. Rules the engine must support:

- **Payment methods:** mobile_tap, physical_tap, chip_or_swipe, online_card_entry, in_app_wallet, simplygo. The same shop can earn differently depending on method. Examples: UOB Preferred Visa gives 4 mpd for a phone tap but 0.4 for the physical card; Citi Rewards gives 0.4 for Apple Pay inside apps.
- **Separate caps within one card:** UOB Preferred Visa has one S$600 cap for phone taps and a separate S$600 cap for online spending.
- **Shared caps:** Citi Rewards has one S$1,000 cap covering all its bonus categories.
- **Minimum spend rules:** Maybank XL gives only 0.4 mpd on everything if she spends under S$500 that month. UOB Visa Signature needs S$1,000 in a category to earn its bonus.
- **Cap resets:** some caps reset on the 1st of the month, others on the statement date. Some count by posting date, others by transaction date.
- **Rounding:** some cards round each purchase down to S$1, some down to S$5, and HSBC totals the month before rounding. SimplyGo fares on UOB are totalled for the month.
- **Category codes (MCCs):** each rule has either a list of eligible codes or a list of excluded codes. Some cards list codes that earn nothing at all.
- **Unconfirmed entries:** entries marked `needs_verification: true` should show a small "unconfirmed" label in the app.

Add these fields to each card:
- `kiasumiles_id` (filled in during Stage 2)
- `statement_day` (set by her when she adds the card)
- `annual_fee_date`

## Her cards

A "My cards" screen where she adds cards from `cards.json` as they arrive, with each card's statement day and card anniversary. Only her cards are used for recommendations. The full list stays available for browsing.

## Recommender ("Which card?")

Inputs: merchant (with autocomplete from her past entries), amount in SGD, payment method, and whether it's charged in foreign currency.

Output: her cards ranked by miles earned for this purchase, accounting for:
- cap left in the right cycle and bucket
- rounding
- minimum spend rules
- excluded codes

Each result shows one line of reasoning, e.g. "S$212 of S$600 tap cap left" or "Pay by phone, not the plastic card". If a purchase would go over a cap, split it into a bonus part and a base-rate part. Show the best card that still has cap left first, then fallbacks.

If the payment method isn't given, compare all the methods she can use at that shop.

## Logging (manual)

She logs purchases by hand, so it must take seconds:

- **"Paid with this" button** on each recommendation. One tap saves the purchase with card, amount, merchant, category and method filled in.
- **Quick-add screen:** large number pad for the amount. Choosing a past merchant fills in category, method and card from last time. One tap to save.
- **Merchant memory:** remember each merchant's category, usual payment method and category code if known. Let her edit it.
- Entries can be edited and deleted.

## Staying accurate

- **Cap warning:** warn when a card reaches 85% of a cap. Show usage as "at least S$X used", since some purchases may not have been logged.
- **Monthly statement check:** she enters each card's statement total. The app shows the gap from what she logged, with one tap to add a catch-up entry for the difference. The catch-up counts against that card's cap.
- **Backup:** JSON export and import. Remind her if the last export was more than 7 days ago.

## Dashboard

- A bar for each cap showing how much is used, with reset dates.
- Estimated miles this month, and points balance per bank. Show when a balance reaches a 10,000-mile transfer block, and when points will expire (e.g. UOB after 2 years).
- **Sign-up bonus tracker:** minimum spend, deadline and progress for each new card.
- **Reminders:**
  - Statement due dates.
  - Annual fee dates. For UOB cards, remind her that UOB takes points (UNI$) to pay the fee and she should request a waiver in the UOB TMRW app to get them back. For Citi, remind her to ask for a waiver.

## KiasuMiles button

A "Copy KiasuMiles prompt" button on the recommender. It copies a message she can paste into Claude chat, listing only her cards that still have cap left (using their `kiasumiles_id`s), plus the merchant, amount and payment method. Example:

"Use KiasuMiles. My cards with cap left: UOB Preferred Visa (online bucket only), Maybank XL. Merchant: Din Tai Fung, paying by Apple Pay, S$45."

The app itself never contacts KiasuMiles or any other outside service.

## Using the KiasuMiles MCP during development

You're connected to KiasuMiles (`claude mcp add --transport http kiasumiles https://kiasumiles.space/mcp`). Call `kiasumiles_data_version` first to confirm it works. Use it only to check and improve our data, never to bulk-copy its dataset. Stay under 30 requests a minute, pausing between batches.

1. **Card IDs:** call `kiasumiles_list_cards` and fill in `kiasumiles_id` for every card in `cards.json` that it supports.
2. **Test suite:** build `tests/purchases.json` from the starter list below; I'll add more. For each purchase, call `kiasumiles_lookup` with her cards and save the top card, earn rate and conditions to `tests/expected/`. Run our recommender on the same purchases (assuming full caps) and list every disagreement side by side. Do not change `cards.json` automatically; I'll check each disagreement against the bank's terms.
3. **Merchant pre-fill:** for the merchants in `tests/purchases.json`, pre-fill merchant memory with the category and best payment method from KiasuMiles.
4. **Unconfirmed entries:** where `cards.json` says `needs_verification`, check specific shops with KiasuMiles and suggest edits for me to approve.
5. **Monthly update:** when I say "monthly update", call `kiasumiles_changes_since` with the date in `data/last_sync.txt`, summarise changes affecting her cards, suggest edits, rerun the tests, then update `data/last_sync.txt`.

Starter purchases: Din Tai Fung (Apple Pay tap), a hawker-centre café (Apple Pay tap), foodpanda (card number entered in app), foodpanda (Apple Pay in app), Grab ride (card number entered), Shopee (online), Uniqlo (in store, tap), FairPrice (Apple Pay tap), MRT fare (phone tap via SimplyGo), Starbucks (Apple Pay tap), Golden Village cinema (online).

## Tests

Unit tests for the earning maths, written before the interface:
- rounding (S$4.99, S$9.99, S$10.00 on each rounding type)
- purchases that go over a cap, split correctly
- separate caps within one card
- the Maybank S$500 minimum spend rule
- cap resets on calendar months vs statement dates
- excluded codes
- SimplyGo monthly totalling

## Stages

1. Data model, earning engine and unit tests. No interface yet.
2. KiasuMiles checks: card IDs, test suite, disagreement list, merchant pre-fill.
3. Interface: My cards, "Which card?", quick-add, "Paid with this".
4. Dashboard, reminders, statement check, backup, KiasuMiles button.
5. PWA install, offline support, GitHub Pages deploy.

Don't commit or push anything until I ask.

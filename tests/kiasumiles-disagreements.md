# Our recommender vs KiasuMiles

Generated 2026-09-30 by `npm run compare:kiasumiles`. KiasuMiles answers are saved in `tests/expected/<profile>/`.
Our side assumes full caps. Nothing here has been applied to `cards.json`: check each against the bank's terms, then record the outcome in `tests/kiasumiles-decisions.json`.

# Profile: all

Every card in data/cards.json (tests the data broadly). Cards: UOB Preferred Visa (formerly UOB PPV), Citi Rewards Mastercard, Maybank XL Rewards, UOB Lady's Card, OCBC Rewards, UOB Visa Signature, HSBC Revolution, DBS Woman's World Mastercard, Standard Chartered Journey, KrisFlyer UOB, Citi PremierMiles, DBS Altitude, UOB PRVI Miles, OCBC 90°N, HSBC TravelOne, Maybank Horizon Visa Signature, BOC Elite Miles, Amex Singapore Airlines KrisFlyer.

## Open disagreements (0)

## Decided (3)

### p02 Hawker centre café S$6.5 (mobile_tap)

| | Top card |
|---|---|
| Ours | Maybank XL Rewards: 4 mpd, 20 miles — Needs S$493.50 more this month on this card, or all its spend earns 0.4 mpd |
| KiasuMiles | HSBC Revolution: 4 mpd, 24 miles (conditional); guaranteed: BOC Elite Miles 1.4 mpd — No merchant data - routed by category inference. Verify before relying on this. |

- **HSBC Revolution** (KiasuMiles best if conditions met): KiasuMiles 4 mpd, ours 0.33 mpd. Ours: "Not a bonus purchase: 0.33 mpd". KiasuMiles: "HSBC Revolution earns 4 mpd because merchant category is eligible and mobile contactless payment qualifies." [S$1,000 cap / calendar month] → **Decided 2026-09-30:** Keep our guessed hawker code (5814); merchant memory will correct it.

### p04 foodpanda S$28 (in_app_wallet)

| | Top card |
|---|---|
| Ours | Maybank XL Rewards: 4 mpd, 100 miles — Needs S$472 more this month on this card, or all its spend earns 0.4 mpd |
| KiasuMiles | DBS Woman's World Mastercard: 4 mpd, 110 miles (conditional); guaranteed: BOC Elite Miles 1.4 mpd |

- **DBS Woman's World Mastercard** (KiasuMiles best if conditions met): KiasuMiles 4 mpd, ours 0.4 mpd. Ours: "Not a bonus purchase: 0.4 mpd". KiasuMiles: "DBS Woman's World Card earns 4 mpd because card has no merchant-category restriction and online payment qualifies." [S$1,000 online cap / calendar month · base points rounded per transaction; online bonus rounded monthly] → **Decided 2026-09-30:** Skipped for now: she isn't eligible at her income.

### p05 Grab S$18 (online_card_entry)

| | Top card |
|---|---|
| Ours | Citi Rewards Mastercard: 4 mpd, 72 miles (unconfirmed) — Sources disagree on Grab rides: SingSaver (Feb 2026) and Mainly Miles (Aug 2026) say 4 mpd, KiasuMiles doesn't. Confirm on your first statement. |
| KiasuMiles | BOC Elite Miles: 1.4 mpd, 25.2 miles (guaranteed); guaranteed: BOC Elite Miles 1.4 mpd |

- **Citi Rewards Mastercard** is our top card at 4 mpd ("S$1,000 of S$1,000 shared cap left"), above KiasuMiles' best of 1.4 mpd. KiasuMiles was sent this card, so it rates it lower here. → **Decided 2026-09-30:** Keep 4 mpd. SingSaver (Feb 2026) and Mainly Miles (Aug 2026) support it; KiasuMiles appears to lack Grab data. Marked disputed in cards.json: confirm on her first statement.

## Agree (4)

- **p01 Din Tai Fung S$45 (mobile_tap)**: ours Maybank XL Rewards: 4 mpd, 180 miles — Needs S$455 more this month on this card, or all its spend earns 0.4 mpd · KiasuMiles Maybank XL Rewards: 4 mpd, 180 miles (conditional); guaranteed: BOC Elite Miles 1.4 mpd
- **p03 foodpanda S$28 (online_card_entry)**: ours Citi Rewards Mastercard: 4 mpd, 112 miles (unconfirmed) — Sources disagree on foodpanda: KiasuMiles says 0.4 mpd (it seems to treat Citi's online bonus as a category list). Confirm on your first statement. · KiasuMiles DBS Woman's World Mastercard: 4 mpd, 110 miles (conditional); guaranteed: BOC Elite Miles 1.4 mpd
- **p07 Uniqlo S$60 (mobile_tap)**: ours OCBC Rewards: 4 mpd, 240 miles (unconfirmed) · KiasuMiles Citi Rewards Mastercard: 4 mpd, 240 miles (conditional); guaranteed: UOB PRVI Miles 1.4 mpd
- **p11 Golden Village S$30 (online_card_entry)**: ours Citi Rewards Mastercard: 4 mpd, 120 miles (unconfirmed) — Sources disagree on Golden Village online: KiasuMiles says 0.4 mpd (it seems to treat Citi's online bonus as a category list). Confirm on your first statement. · KiasuMiles Maybank XL Rewards: 4 mpd, 120 miles (conditional); guaranteed: UOB PRVI Miles 1.4 mpd

## KiasuMiles couldn't answer (3)

- **p06 Shopee S$60 (online_card_entry)**: Multiple merchant categories remain possible. Confirm the outlet and payment method before recommending a card.
- **p08 FairPrice S$80 (mobile_tap)**: Multiple merchant categories remain possible. Confirm the outlet and payment method before recommending a card.
- **p10 Starbucks S$8.5 (mobile_tap)**: Multiple merchant categories remain possible. Confirm the outlet and payment method before recommending a card.

## Not compared (1)

- **p09 MRT fare S$1.8 (simplygo)**: SimplyGo: our engine is the authority.

# Profile: planned

Her planned cards. Cards: UOB Preferred Visa (formerly UOB PPV), Citi Rewards Mastercard.

## Open disagreements (0)

## Decided (3)

### p03 foodpanda S$28 (online_card_entry)

| | Top card |
|---|---|
| Ours | Citi Rewards Mastercard: 4 mpd, 112 miles (unconfirmed) — Sources disagree on foodpanda: KiasuMiles says 0.4 mpd (it seems to treat Citi's online bonus as a category list). Confirm on your first statement. |
| KiasuMiles | UOB Preferred Visa (formerly UOB PPV): 4 mpd, 100 miles (conditional); guaranteed: Citi Rewards Mastercard 0.4 mpd |

- **Citi Rewards Mastercard** (KiasuMiles best guaranteed): KiasuMiles 0.4 mpd, ours 4 mpd. Ours: "S$1,000 of S$1,000 shared cap left". KiasuMiles: "Citi Rewards Mastercard falls back to base rate because merchant category is outside this card's bonus whitelist." [S$1,000 cap / statement month] → **Decided 2026-09-30:** Keep 4 mpd: Citi's online bonus is all online except travel/listed exclusions and in-app wallets. KiasuMiles appears to model it as a category whitelist. Marked disputed: confirm on her first statement.

### p05 Grab S$18 (online_card_entry)

| | Top card |
|---|---|
| Ours | Citi Rewards Mastercard: 4 mpd, 72 miles (unconfirmed) — Sources disagree on Grab rides: SingSaver (Feb 2026) and Mainly Miles (Aug 2026) say 4 mpd, KiasuMiles doesn't. Confirm on your first statement. |
| KiasuMiles | Citi Rewards Mastercard: 0.4 mpd, 7.2 miles (guaranteed); guaranteed: Citi Rewards Mastercard 0.4 mpd |

- **Citi Rewards Mastercard** (KiasuMiles best if conditions met): KiasuMiles 0.4 mpd, ours 4 mpd. Ours: "S$1,000 of S$1,000 shared cap left". KiasuMiles: "Citi Rewards Mastercard falls back to base rate because merchant category is outside this card's bonus whitelist." [S$1,000 cap / statement month] → **Decided 2026-09-30:** Keep 4 mpd. SingSaver (Feb 2026) and Mainly Miles (Aug 2026) support it; KiasuMiles appears to lack Grab data. Marked disputed in cards.json: confirm on her first statement.
- **Citi Rewards Mastercard** (KiasuMiles best guaranteed): KiasuMiles 0.4 mpd, ours 4 mpd. Ours: "S$1,000 of S$1,000 shared cap left". KiasuMiles: "Citi Rewards Mastercard falls back to base rate because merchant category is outside this card's bonus whitelist." [S$1,000 cap / statement month] → **Decided 2026-09-30:** Keep 4 mpd. SingSaver (Feb 2026) and Mainly Miles (Aug 2026) support it; KiasuMiles appears to lack Grab data. Marked disputed in cards.json: confirm on her first statement.

### p11 Golden Village S$30 (online_card_entry)

| | Top card |
|---|---|
| Ours | Citi Rewards Mastercard: 4 mpd, 120 miles (unconfirmed) — Sources disagree on Golden Village online: KiasuMiles says 0.4 mpd (it seems to treat Citi's online bonus as a category list). Confirm on your first statement. |
| KiasuMiles | UOB Preferred Visa (formerly UOB PPV): 4 mpd, 120 miles (conditional); guaranteed: Citi Rewards Mastercard 0.4 mpd |

- **Citi Rewards Mastercard** (KiasuMiles best guaranteed): KiasuMiles 0.4 mpd, ours 4 mpd. Ours: "S$1,000 of S$1,000 shared cap left". KiasuMiles: "Citi Rewards Mastercard falls back to base rate because merchant category is outside this card's bonus whitelist." [S$1,000 cap / statement month] → **Decided 2026-09-30:** Keep 4 mpd (same reason as foodpanda). Marked disputed: confirm on her first statement.

## Agree (4)

- **p01 Din Tai Fung S$45 (mobile_tap)**: ours UOB Preferred Visa (formerly UOB PPV): 4 mpd, 180 miles · KiasuMiles UOB Preferred Visa (formerly UOB PPV): 4 mpd, 180 miles (conditional); guaranteed: Citi Rewards Mastercard 0.4 mpd
- **p02 Hawker centre café S$6.5 (mobile_tap)**: ours UOB Preferred Visa (formerly UOB PPV): 4 mpd, 20 miles · KiasuMiles UOB Preferred Visa (formerly UOB PPV): 4 mpd, 20 miles (conditional); guaranteed: Citi Rewards Mastercard 0.4 mpd — No merchant data - routed by category inference. Verify before relying on this.
- **p04 foodpanda S$28 (in_app_wallet)**: ours UOB Preferred Visa (formerly UOB PPV): 4 mpd, 100 miles · KiasuMiles UOB Preferred Visa (formerly UOB PPV): 4 mpd, 100 miles (conditional); guaranteed: Citi Rewards Mastercard 0.4 mpd _(KiasuMiles has no separate in-app Apple Pay method; compared against its 'online' result.)_
- **p07 Uniqlo S$60 (mobile_tap)**: ours Citi Rewards Mastercard: 4 mpd, 240 miles · KiasuMiles Citi Rewards Mastercard: 4 mpd, 240 miles (conditional); guaranteed: Citi Rewards Mastercard 0.4 mpd

## KiasuMiles couldn't answer (3)

- **p06 Shopee S$60 (online_card_entry)**: Not re-queried: KiasuMiles couldn't resolve this merchant with any card set.
- **p08 FairPrice S$80 (mobile_tap)**: Not re-queried: KiasuMiles couldn't resolve this merchant with any card set.
- **p10 Starbucks S$8.5 (mobile_tap)**: Not re-queried: KiasuMiles couldn't resolve this merchant with any card set.

## Not compared (1)

- **p09 MRT fare S$1.8 (simplygo)**: SimplyGo: our engine is the authority.

# Part B: merchant memory

Task spec for a Claude Code session. Part A (UOB Preferred Visa rules from UOB's T&Cs Ver 3.0) is done and committed in `4719daa`.

## Context from Part A

- Follow `CLAUDE.md` (decisions and writing style) and `SPEC.md`. Plain HTML/CSS/JS, no build step, works offline. New files under `src/` must be added to `FILES` in `sw.js`.
- Inputs are in the repo: `data/mcc-codes.json` (category code descriptions) and `data/merchant-mccs.json` (third-party reported merchant codes, with a `not_found` list). Don't download any other code list.
- Bonus rules can now carry `unconfirmed_methods` (e.g. UOB Preferred Visa online: `["in_app_wallet"]`); the engine marks those purchases unconfirmed.
- UOB Preferred Visa's online list in `data/cards.json` uses ranges (`5732-5735`, `5944-5949`, `5966-5970`, `7998-7999`); compare expanded code sets in the sync test.
- `docs/terms/` (UOB T&Cs) is not in the repo.
- Run `npm test` before finishing. Don't commit or push unless asked.

## Spec

### 1. Data model

Each merchant has: name, aliases, category, channel (in_person / online / transit), mcc, alt_mccs, status, source, per-card results, use count, last used, and edited_by_her (true once she changes anything).

Status, from most to least reliable:
- "code entered": she typed the real category code.
- "confirmed by statement": her statement showed whether it earned the bonus.
- "reported": code published by a third party (data/merchant-mccs.json).
- "guess": no code; uses the category's default code.

Per-card results record what the statement check found, e.g. `{ citi_rewards: "earned bonus", uob_preferred_visa: "base rate only" }`. A per-card result overrides the code rules for that card and merchant.

### 2. Pre-fill

Expand data/merchants.prefill.json with the merchants below (category and channel). Then apply data/merchant-mccs.json: merchants listed there get status "reported" with their code, alt_mccs and source; merchants in its not_found list stay "guess".

- fast_food: McDonald's, KFC, Burger King, Jollibee, Subway, MOS Burger, Popeyes, Old Chang Kee
- cafe: Toast Box, Ya Kun Kaya Toast, Starbucks, The Coffee Bean & Tea Leaf, Luckin Coffee, LiHO, KOI Thé, Gong Cha, Chagee
- hawker: Koufu, Kopitiam, Food Republic
- bakery: BreadTalk, Bengawan Solo, Mr Bean
- dining: Din Tai Fung, Haidilao, Sushi Tei, Genki Sushi, Saizeriya, Swensen's
- food_delivery: foodpanda, GrabFood, Deliveroo
- groceries: FairPrice, Cold Storage, Sheng Siong, Giant, Don Don Donki
- online_groceries: FairPrice Online, RedMart
- convenience: 7-Eleven, Cheers
- rides: Grab, Gojek, TADA, CDG Zig
- online_shopping: Shopee, Lazada, Amazon.sg, Taobao, TikTok Shop, Zalora
- fashion: Uniqlo, H&M, Zara, Cotton On, Love Bonito
- department_store: Takashimaya, Isetan, Metro, Tangs
- electronics: Challenger, Courts, Harvey Norman, Best Denki, Apple Store
- pharmacy: Watsons, Guardian, Unity
- beauty: Sephora
- books_hobbies: Popular, Kinokuniya, Decathlon
- cinema: Golden Village, Shaw Theatres
- travel_agency: Klook, Trip.com, Agoda, Booking.com
- airlines: Singapore Airlines, Scoot
- subscriptions: Netflix, Spotify, Disney+, Apple iCloud (recurring)
- bills_utilities: SP Group
- ewallet_topup: GrabPay top-up, YouTrip top-up

Aliases so search finds them: FairPrice = NTUC, NTUC FairPrice; McDonald's = McD, Macs; CDG Zig = ComfortDelGro, Comfort; Golden Village = GV; Don Don Donki = Donki; Ya Kun Kaya Toast = Ya Kun.

Merging: bump a pre-fill version number. On update, only add new merchants and update entries she hasn't edited that are still "guess" or "reported". Never touch "code entered", "confirmed by statement" or anything with edited_by_her.

### 3. Category code descriptions

Use data/mcc-codes.json (codes consolidated from Citi, DBS, UOB and OCBC documents, plus the public list). Don't download any other code list.

- Wherever a code appears (merchant memory, the code field), show its description in sentence case, using only the part before the first dash: "5499: Miscellaneous food stores". Show the full description and any note when she taps it.
- The engine ignores the "banks" field; data/cards.json stays the source of truth for earning rules.
- Add a test that checks the UOB Preferred Visa online bonus list and exclusions in data/cards.json match the uob_preferred_visa entries in data/mcc-codes.json, so the two can't drift apart.
- Next to the code field, add the hint: "Find it with HeyMax's merchant lookup, or on your bank statement."

### 4. How recommendations use this

Code used: her entered code, else the reported code, else the category default. Per-card statement results override everything for that card.

Show "unconfirmed" on a recommendation only when the uncertainty could change the result for her cards:
- the merchant is a "guess" or "reported" with alt_mccs, AND
- the deciding rule is a whitelist (only listed codes earn the bonus), AND
- the main code or any alt code would give a different top card or miles.

Blacklist rules (UOB Preferred Visa phone tap, Citi online) don't need the exact code, so don't flag them unless an exclusion could apply.

### 5. Statement check

For each card, list purchases from unconfirmed merchants that used a whitelist rule, or a disputed rule (e.g. Grab, foodpanda, Golden Village on Citi Rewards): "Did your foodpanda order on 3 Oct earn 10X points?" Yes → store "earned bonus" for that card and set status "confirmed by statement". No → store "base rate only" for that card. Show a one-line summary of what changed.

### 6. Add screen and "Which card?"

- Chips: her 8 most-used merchants (use count, ties by last used). With no history, show 8 common pre-filled ones.
- Typing searches all merchants and aliases. If there's no match, offer "Add [name]" with a category picker (including "Not sure"), saved as "guess".
- Picking a merchant fills in its category, channel, and the card and method from last time.
- Before a merchant is chosen, the line above Save reads "Pick a merchant to see the best card." Save stays disabled until a merchant and amount are entered.
- "Where" options follow the category: MRT / bus only for public transport; online-only categories (food delivery, online shopping, online groceries, travel booking sites, subscriptions) default to Online.
- If she changes Where or How for a merchant, remember it for next time.

### 7. Merchant memory screen (History)

Each merchant shows: category, code with description, status, source ("Reported by MoneySmart, Jan 2026"), per-card results, and use count. She can edit any field, add aliases, or delete a merchant. Editing sets edited_by_her.

### 8. Tests

Add tests for: pre-fill merge not overwriting her edits; code priority (entered > reported > default); per-card statement results overriding rules; "unconfirmed" only appearing when alt codes change the result; alias search; cards.json and mcc-codes.json staying in sync for UOB Preferred Visa.

## When done

Follow the writing style in CLAUDE.md for all new text. List every new string and the test results.

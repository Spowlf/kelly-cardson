// Fixture cards for engine tests. Shaped like data/cards.json (schema v2) but frozen here,
// so editing a real rate or cap never breaks the maths tests.

const ALL = ['mobile_tap', 'physical_tap', 'chip_or_swipe', 'online_card_entry', 'in_app_wallet', 'simplygo'];

export const uobPpv = {
  id: 'uob_ppv', name: 'UOB PPV', bank: 'UOB',
  base_mpd: { local: 0.4, fcy: 0.4 }, fcy_fee_pct: 3.25,
  earn_block: { type: 'per_txn_floor', size_sgd: 5 },
  earn_block_overrides: [{ methods: ['simplygo'], type: 'monthly_pooled_floor', size_sgd: 5 }],
  cap_period: 'calendar_month', cap_basis: 'posting_date',
  caps: { tap: { sgd: 600 }, online: { sgd: 600 } },
  min_spend: null,
  bonus_rules: [
    { id: 'mobile_contactless', mpd: 4, methods: ['mobile_tap', 'simplygo'], currencies: ['SGD', 'FCY'], match: { mode: 'blacklist', mccs: [] }, cap_bucket: 'tap' },
    { id: 'selected_online', mpd: 4, methods: ['online_card_entry', 'in_app_wallet'], currencies: ['SGD', 'FCY'], match: { mode: 'whitelist', mccs: ['5812', '5814', '5399', '7832'] }, cap_bucket: 'online' },
  ],
  no_points: { mccs: ['4900', '9000-9999'], merchants: ['AXS'], notes: [], needs_verification: false },
};

export const citiRewards = {
  id: 'citi_rewards', name: 'Citi Rewards', bank: 'Citi',
  base_mpd: { local: 0.4, fcy: 0.4 }, fcy_fee_pct: 3.25,
  earn_block: { type: 'per_txn_floor', size_sgd: 1 },
  cap_period: 'statement_month', cap_basis: 'transaction_date',
  caps: { shared: { sgd: 1000 } },
  min_spend: null,
  bonus_rules: [
    { id: 'online_non_travel', mpd: 4, methods: ['online_card_entry'], currencies: ['SGD', 'FCY'], match: { mode: 'blacklist', mccs: ['3000-3350', '4511', '4722', '7011'] }, cap_bucket: 'shared' },
    { id: 'shopping_any_method', mpd: 4, methods: ['mobile_tap', 'physical_tap', 'chip_or_swipe', 'online_card_entry'], currencies: ['SGD', 'FCY'], match: { mode: 'whitelist', mccs: ['5311', '5651'] }, cap_bucket: 'shared' },
  ],
  no_points: { mccs: ['8211-8299', '4900'], merchants: [], notes: [], needs_verification: false },
};

export const maybankXl = {
  id: 'maybank_xl', name: 'Maybank XL', bank: 'Maybank',
  base_mpd: { local: 0.4, fcy: 0.4 }, fcy_fee_pct: 3.25,
  earn_block: { type: 'per_txn_floor', size_sgd: 5 },
  cap_period: 'calendar_month', cap_basis: 'transaction_date',
  caps: { shared: { sgd: 1000 } },
  min_spend: { sgd: 500, failure: 'all_base' },
  bonus_rules: [
    { id: 'dining', mpd: 4, methods: ALL, currencies: ['SGD', 'FCY'], match: { mode: 'whitelist', mccs: ['5811', '5812', '5814'] }, cap_bucket: 'shared' },
    { id: 'all_fcy', mpd: 4, methods: ALL, currencies: ['FCY'], match: { mode: 'all' }, cap_bucket: 'shared' },
  ],
  no_points: { mccs: [], merchants: [], notes: [], needs_verification: false },
};

export const hsbcRevo = {
  id: 'hsbc_revo', name: 'HSBC Revolution', bank: 'HSBC',
  base_mpd: { local: 0.33, fcy: 0.33 }, fcy_fee_pct: 3.25,
  earn_block: { type: 'per_txn_nearest', size_sgd: 1 },
  bonus_earn_block: { type: 'monthly_pooled_floor', size_sgd: 1 },
  cap_period: 'calendar_month', cap_basis: 'posting_date',
  caps: { bonus: { sgd: 1000 } },
  min_spend: null,
  bonus_rules: [
    { id: 'online_or_contactless', mpd: 3.33, methods: ['mobile_tap', 'physical_tap', 'online_card_entry', 'in_app_wallet'], currencies: ['SGD', 'FCY'], match: { mode: 'whitelist', mccs: ['5812'] }, cap_bucket: 'bonus' },
  ],
  no_points: { mccs: [], merchants: [], notes: [], needs_verification: false },
};

export const uobVs = {
  id: 'uob_vs', name: 'UOB Visa Signature', bank: 'UOB',
  base_mpd: { local: 0.4, fcy: 0.4 }, fcy_fee_pct: 3.25,
  earn_block: { type: 'per_txn_floor', size_sgd: 5 },
  cap_period: 'statement_month', cap_basis: null,
  caps: {
    fcy: { sgd: 1200, min_spend_sgd: 1000, rank_until_min_met: 'base', hard_limit: true, needs_verification: true },
    contactless: { sgd: 1200, min_spend_sgd: 1000, rank_until_min_met: 'base', hard_limit: true, needs_verification: true },
  },
  min_spend: null,
  bonus_rules: [
    { id: 'fcy', mpd: 4, methods: ALL, currencies: ['FCY'], match: { mode: 'all' }, cap_bucket: 'fcy' },
    { id: 'contactless', mpd: 4, methods: ['mobile_tap', 'physical_tap', 'simplygo'], currencies: ['SGD', 'FCY'], match: { mode: 'all' }, cap_bucket: 'contactless' },
  ],
  no_points: { mccs: [], merchants: [], notes: [], needs_verification: true },
};

// A card with no earn_block and a category-matched rule, for defaults and "unconfirmed".
export const scJourney = {
  id: 'sc_journey', name: 'SC Journey', bank: 'Standard Chartered',
  base_mpd: { local: 1.2, fcy: 2.0 }, fcy_fee_pct: 3.5,
  cap_period: 'calendar_month', cap_basis: null,
  caps: { bonus: { sgd: 1000 } },
  min_spend: null,
  bonus_rules: [
    { id: 'transport_delivery', mpd: 3, methods: ALL, currencies: ['SGD', 'FCY'], match: { mode: 'categories', categories: ['rides', 'food_delivery'] }, cap_bucket: 'bonus', needs_verification: true },
  ],
  no_points: { mccs: [], merchants: [], notes: [], needs_verification: true },
};

export const ladys = {
  id: 'uob_ladys', name: "UOB Lady's", bank: 'UOB',
  base_mpd: { local: 0.4, fcy: 0.4 },
  earn_block: { type: 'per_txn_floor', size_sgd: 5 },
  cap_period: 'calendar_month', cap_basis: 'posting_date',
  caps: { chosen: { sgd: 1000 } },
  min_spend: null,
  bonus_rules: [
    { id: 'chosen_category', mpd: 4, methods: ALL, currencies: ['SGD', 'FCY'], match: { mode: 'user_category', user_setting: 'ladys_category', options: ['Dining', 'Fashion'], option_categories: { Dining: ['dining', 'cafe'], Fashion: ['fashion'] } }, cap_bucket: 'chosen', needs_verification: true },
  ],
  no_points: { mccs: [], merchants: [], notes: [], needs_verification: true },
};

export const krisflyerUob = {
  id: 'krisflyer_uob', name: 'KrisFlyer UOB', bank: 'UOB',
  base_mpd: { local: 1.2, fcy: 1.2 },
  earn_block: { type: 'per_txn_floor', size_sgd: 5 },
  cap_period: null, cap_basis: null, caps: {}, min_spend: null,
  bonus_rules: [
    { id: 'sia_group', mpd: 3, methods: ALL, currencies: ['SGD', 'FCY'], match: { mode: 'merchants', merchants: ['Singapore Airlines', 'Scoot'] }, cap_bucket: null },
    { id: 'lifestyle', mpd: 2.4, methods: ALL, currencies: ['SGD', 'FCY'], match: { mode: 'categories', categories: ['dining'] }, cap_bucket: null, condition: 'Needs S$1,000 SIA spend' },
  ],
  no_points: { mccs: [], merchants: [], notes: [], needs_verification: true },
};

export const categories = [
  { id: 'dining', channel: 'in_person', default_mcc: '5812', mcc_is_guess: true },
  { id: 'cafe', channel: 'in_person', default_mcc: '5814', mcc_is_guess: true },
  { id: 'fashion', channel: 'in_person', default_mcc: '5651', mcc_is_guess: true },
  { id: 'groceries', channel: 'in_person', default_mcc: '5411', mcc_is_guess: true },
  { id: 'food_delivery', channel: 'online', default_mcc: '5814', mcc_is_guess: true },
  { id: 'rides', channel: 'online', default_mcc: '4121', mcc_is_guess: true },
  { id: 'public_transport', channel: 'transit', default_mcc: '4111', mcc_is_guess: true },
  { id: 'airlines', channel: 'online', default_mcc: '4511', mcc_is_guess: true },
  { id: 'bills_utilities', channel: 'online', default_mcc: '4900', mcc_is_guess: true, no_miles: true, no_miles_label: 'No miles, use any card' },
];

let seq = 0;
// Build a logged purchase with sensible defaults.
export function txn(cardId, amount, overrides = {}) {
  seq += 1;
  return { id: `t${seq}`, cardId, amount, date: '2026-09-10', method: 'mobile_tap', fcy: false, mcc: '5812', category: 'dining', merchant: 'Test Shop', ...overrides };
}

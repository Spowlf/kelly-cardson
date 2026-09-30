// Money is handled in whole cents to avoid floating-point drift.

export const toCents = (sgd) => Math.round(sgd * 100);
export const toSgd = (cents) => cents / 100;

// Used when a card has no earn_block in cards.json (decision: S$1 round-down, unconfirmed).
export const DEFAULT_BLOCK = { type: 'per_txn_floor', size_sgd: 1, needs_verification: true };

export const isPooled = (block) => block.type === 'monthly_pooled_floor';

const sizeOf = (block) => toCents(block.size_sgd);

// Round one purchase the way the bank does.
export function roundTxn(cents, block) {
  const size = sizeOf(block);
  if (block.type === 'per_txn_nearest') return Math.round(cents / size) * size;
  return Math.floor(cents / size) * size;
}

// Always round down: used for both parts of a split so miles are never overestimated.
export function floorTo(cents, block) {
  const size = sizeOf(block);
  return Math.floor(cents / size) * size;
}

// For monthly pooled rounding: how much extra spend counts once `cents` joins a pool
// that already holds `poolBefore`.
export function pooledIncrement(poolBefore, cents, block) {
  const size = sizeOf(block);
  return Math.floor((poolBefore + cents) / size) * size - Math.floor(poolBefore / size) * size;
}

// Cap cycles. Dates are 'YYYY-MM-DD' strings, handled in UTC so time zones never shift a day.

const DAY_MS = 86400000;

const parse = (date) => {
  const [y, m, d] = date.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
};
const format = (ms) => new Date(ms).toISOString().slice(0, 10);

export const addDays = (date, n) => format(parse(date) + n * DAY_MS);

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// '2027-03-31' -> '31 Mar 2027'
export function formatDay(date) {
  const [y, m, d] = date.split('-').map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

// Whole days from one date to another (negative if `to` is earlier).
export const daysBetween = (from, to) => Math.round((parse(to) - parse(from)) / DAY_MS);

// Same day n months later, clamped to the month's last day.
export function addMonths(date, n) {
  const [y, m, d] = date.split('-').map(Number);
  const lastDay = new Date(Date.UTC(y, m - 1 + n + 1, 0)).getUTCDate();
  return format(Date.UTC(y, m - 1 + n, Math.min(d, lastDay)));
}

// Today in the phone's local time zone, as 'YYYY-MM-DD'.
export function today(now = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

// Statement date in a month (monthIndex may overflow), clamped to the month's last day.
function statementDate(year, monthIndex, day) {
  const first = new Date(Date.UTC(year, monthIndex, 1));
  const y = first.getUTCFullYear();
  const m = first.getUTCMonth();
  const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return format(Date.UTC(y, m, Math.min(day, lastDay)));
}

/**
 * The cap cycle a date falls in.
 * statement_month: runs from the day after one statement date up to and including the next.
 * Anything else (or no statement day set) is a calendar month; `assumed` flags the fallback.
 */
export function cycleFor(date, period, statementDay) {
  const [y, m] = date.split('-').map(Number);
  if (period === 'statement_month' && statementDay) {
    const thisMonth = statementDate(y, m - 1, statementDay);
    const end = date <= thisMonth ? thisMonth : statementDate(y, m, statementDay);
    const [ey, em] = end.split('-').map(Number);
    const previous = statementDate(ey, em - 2, statementDay);
    return { key: `S${end}`, start: addDays(previous, 1), end, resetDate: addDays(end, 1), period, assumed: false };
  }
  const start = `${date.slice(0, 7)}-01`;
  const end = format(Date.UTC(y, m, 0));
  return {
    key: `M${date.slice(0, 7)}`,
    start,
    end,
    resetDate: addDays(end, 1),
    period: 'calendar_month',
    assumed: period === 'statement_month',
  };
}

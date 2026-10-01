// My cards: her wallet in priority order, the full card list to browse, add/edit forms, settings.

import { h, field, sheet, toast, money, sgd, shortName, unconfirmedTag, methodPhrase, fill } from './dom.js';
import { exportBackup, importBackup } from './backup.js';
import { state, addMyCard, updateMyCard, removeMyCard, restoreMyCard, moveMyCard, hasCard, setSetting } from '../db/repo.js';
import { formatDay, today, DEFAULT_SETTINGS } from '../engine/index.js';

export function renderCards(root) {
  const render = () => renderCards(root);
  fill(root, 
    h('section', {},
      h('h2', { class: 'subhead' }, 'Your cards'),
      state.myCards.length
        ? h('ol', { class: 'list wallet' }, state.myCards.map((c, i) => walletRow(c, i, render)))
        : h('p', { class: 'empty-line' }, 'No cards yet. Add each card when it arrives.'),
      state.myCards.length > 1 ? h('p', { class: 'muted small' }, 'When two cards earn the same, the one higher in this list comes first.') : null),
    h('section', {},
      h('h2', { class: 'subhead' }, 'All cards'),
      h('ul', { class: 'list' }, state.cards.map((card) => h('li', {}, catalogueRow(card, render))))),
    settingsSection(render));
}

function walletRow(c, i, render) {
  const card = state.cardsById[c.cardId];
  const facts = [
    c.statementDay ? `Statement day ${c.statementDay}` : 'Statement day not set',
    c.annualFeeDate ? `annual fee ${formatDay(c.annualFeeDate)}` : null,
  ].filter(Boolean).join(', ');
  const move = (dir, label, disabled) => h('button', {
    type: 'button', class: 'icon-button', 'aria-label': `${label} ${shortName(card)}`, disabled,
    onclick: async () => { await moveMyCard(c.cardId, dir); render(); },
  }, dir < 0 ? '↑' : '↓');
  return h('li', { class: 'wallet-row' },
    h('button', { type: 'button', class: 'list-row', onclick: () => cardForm(card, c, render) },
      h('span', { class: 'list-main' },
        h('span', { class: 'list-title' }, shortName(card)),
        h('span', { class: 'list-sub' }, facts))),
    h('span', { class: 'reorder' }, move(-1, 'Move up', i === 0), move(1, 'Move down', i === state.myCards.length - 1)));
}

const methodList = (methods) => (methods.length >= 6 ? 'any way to pay' : methods.map(methodPhrase).join(', '));
const lowerFirst = (s) => s[0].toLowerCase() + s.slice(1);
const period = (card) => (card.cap_period === 'statement_month' ? 'a statement month' : 'a month');

// Short, parallel values for the facts at the top of the card sheet.
function baseRate({ local, fcy }) {
  return local === fcy ? `${local} mpd, local and foreign currency` : `${local} mpd local, ${fcy} mpd foreign currency`;
}
function rounding(block, card) {
  const size = sgd(block.size_sgd);
  if (block.type === 'per_txn_nearest') return `To the nearest ${size}, per purchase`;
  if (block.type === 'monthly_pooled_floor') return `Down to the nearest ${size}, on the ${card.cap_period === 'statement_month' ? 'statement month' : 'month'}'s total`;
  return `Down to the nearest ${size}, per purchase`;
}
function minSpend(card) {
  const m = card.min_spend;
  const failure = m.failure === 'all_base' ? `, or everything earns ${card.base_mpd.local} mpd` : '';
  return `${sgd(m.sgd)} ${period(card)}${failure}`;
}

// Source URLs as linked names: "Mainly Miles review", "MileLion". A ';'-separated part with
// no URL (e.g. "UOB Preferred Visa terms, version 3.0, 10 Mar 2026") is shown as written.
const SITES = { 'mainlymiles.com': 'Mainly Miles', 'milelion.com': 'MileLion' };
function sources(source) {
  const parts = source.split(';').map((s) => s.trim()).filter(Boolean);
  const named = parts.filter((s) => !/https?:\/\//.test(s));
  const urls = source.match(/https?:\/\/[^\s;,)]+/g) || [];
  const links = [...named, ...urls.map((url) => {
    const host = new URL(url).hostname.replace(/^www\./, '');
    const kind = /review/.test(url) ? ' review' : /\/credit-cards\/?$/.test(url) ? ' card comparison' : '';
    const name = `${SITES[host] || host}${kind}`;
    return h('a', { href: url, target: '_blank', rel: 'noopener' }, name);
  })];
  return [links.length > 1 ? 'Sources: ' : 'Source: ', ...links.flatMap((a, i) => (i ? [i === links.length - 1 ? ' and ' : ', ', a] : [a]))];
}

// One bonus rule's box: its category, rate, cap and any minimum, condition or note.
function ruleBox(card, r) {
  const others = card.bonus_rules.filter((o) => o !== r);
  const sharing = r.cap_bucket ? others.filter((o) => o.cap_bucket === r.cap_bucket) : [];
  const shared = !sharing.length ? ''
    : sharing.length === others.length ? ', shared across all bonus categories'
    : `, shared with ${sharing.map((o) => o.label || `${o.mpd} mpd`).join(' and ')}`;
  const cap = r.cap_bucket ? card.caps[r.cap_bucket] : null;
  return h('li', {},
    h('p', { class: 'rule-head' }, r.label || `${r.mpd} mpd`, r.needs_verification ? unconfirmedTag() : null),
    h('p', {}, `${r.mpd} mpd, ${methodList(r.methods)}`),
    h('p', { class: 'muted' }, cap ? `Cap: ${sgd(cap.sgd)} ${period(card)}${shared}` : 'Cap: none'),
    cap?.min_spend_sgd ? h('p', { class: 'muted' }, `Needs ${sgd(cap.min_spend_sgd)} ${period(card)} in this category, or the category earns ${card.base_mpd.local} mpd.`) : null,
    r.valid_until ? h('p', { class: 'muted' }, `Until ${formatDay(r.valid_until)}`) : null,
    r.condition ? h('p', { class: 'muted' }, `${r.condition}.`) : null,
    r.notes ? h('p', { class: 'muted' }, r.notes) : null);
}

function catalogueRow(card, render) {
  const top = Math.max(card.base_mpd.local, ...card.bonus_rules.map((r) => r.mpd));
  const owned = hasCard(card.id);
  return h('button', { type: 'button', class: 'list-row', onclick: () => cardDetails(card, render) },
    h('span', { class: 'list-main' },
      h('span', { class: 'list-title' }, shortName(card), owned ? h('span', { class: 'tag' }, 'Yours') : null),
      h('span', { class: 'list-sub' }, `${card.bank}, up to ${top} mpd, base ${card.base_mpd.local} mpd`)));
}

// Everything the app knows about a card, with unconfirmed parts labelled.
function cardDetails(card, render) {
  const owned = hasCard(card.id);
  const hasCycle = Object.keys(card.caps || {}).length > 0 || !!card.min_spend;
  const bonusBlock = card.bonus_earn_block && card.bonus_earn_block.type !== card.earn_block?.type ? card.bonus_earn_block : null;
  let s;
  const content = h('div', { class: 'sheet-form' },
    h('dl', { class: 'facts' },
      h('dt', {}, 'Base rate'), h('dd', {}, baseRate(card.base_mpd)),
      h('dt', {}, 'Annual fee'), h('dd', {}, card.annual_fee_sgd ? money(card.annual_fee_sgd) : 'None', card.fee_notes ? h('span', { class: 'muted block' }, card.fee_notes) : null),
      h('dt', {}, 'Rounding'), h('dd', {}, card.earn_block ? rounding(card.earn_block, card) : 'Not known', card.earn_block?.needs_verification ? unconfirmedTag() : null,
        bonusBlock ? h('span', { class: 'muted block' }, `Bonus miles: ${lowerFirst(rounding(bonusBlock, card))}`) : null),
      card.min_spend ? [h('dt', {}, 'Minimum spend'), h('dd', {}, minSpend(card), card.min_spend.needs_verification ? unconfirmedTag() : null)] : null,
      hasCycle ? [h('dt', {}, 'Caps reset'), h('dd', {}, card.cap_period === 'statement_month' ? 'Statement date' : '1st of each month')] : null),
    card.bonus_rules.length ? h('h3', {}, 'Bonus rates') : null,
    h('ul', { class: 'rules' }, card.bonus_rules.map((r) => ruleBox(card, r))),
    card.gotchas?.length ? h('h3', {}, 'Watch out for') : null,
    card.gotchas?.length ? h('ul', { class: 'bullets' }, card.gotchas.map((g) => h('li', {}, g))) : null,
    h('p', { class: 'muted small' }, `Checked ${formatDay(card.last_verified)}. `, sources(card.source), '.'),
    h('div', { class: 'sheet-actions' },
      owned
        ? h('button', { type: 'button', class: 'button secondary', onclick: () => { s.close(); cardForm(card, state.myCards.find((c) => c.cardId === card.id), render); } }, 'Edit your details')
        : h('button', { type: 'button', class: 'button primary', onclick: () => { s.close(); cardForm(card, null, render); } }, 'Add to your cards')));
  s = sheet(shortName(card), content);
}

// Add or edit her details for a card: statement day, annual fee date, choices, conditions met.
function cardForm(card, mine, render) {
  const statementDay = h('select', { required: true },
    h('option', { value: '', selected: !mine?.statementDay }, 'Choose a day'),
    Array.from({ length: 31 }, (_, i) => h('option', { value: String(i + 1), selected: mine?.statementDay === i + 1 }, String(i + 1))));
  const feeDate = h('input', { type: 'date', value: mine?.annualFeeDate || '' });
  const opened = h('input', { type: 'date', value: mine?.openedDate || '' });
  const signupMin = h('input', { type: 'text', inputmode: 'decimal', value: mine?.signup?.minSpendSgd ?? '', placeholder: 'e.g. 1000' });
  const signupDeadline = h('input', { type: 'date', value: mine?.signup?.deadline || '' });
  const signupMiles = h('input', { type: 'text', inputmode: 'numeric', value: mine?.signup?.bonusMiles ?? '', placeholder: 'e.g. 30000' });

  const choiceRules = card.bonus_rules.filter((r) => r.match?.mode === 'user_category');
  const choiceInputs = choiceRules.map((r) => ({
    key: r.match.user_setting,
    input: h('select', {}, h('option', { value: '' }, 'Not chosen yet'), r.match.options.map((o) => h('option', { value: o, selected: mine?.choices?.[r.match.user_setting] === o }, r.match.option_labels?.[o] ?? o))),
  }));
  const conditionRules = card.bonus_rules.filter((r) => r.condition);
  const conditionInputs = conditionRules.map((r) => ({ id: r.id, input: h('input', { type: 'checkbox', checked: !!mine?.conditionsMet?.[r.id] }), rule: r }));

  let s;
  const form = h('form', {
    class: 'sheet-form',
    onsubmit: async (e) => {
      e.preventDefault();
      const fields = {
        statementDay: statementDay.value ? Number(statementDay.value) : null,
        annualFeeDate: feeDate.value || null,
        openedDate: opened.value || null,
        signup: signupMin.value && signupDeadline.value
          ? { minSpendSgd: Number(signupMin.value.replace(/[^\d.]/g, '')), deadline: signupDeadline.value, bonusMiles: signupMiles.value ? Number(signupMiles.value.replace(/[^\d]/g, '')) : null }
          : null,
        choices: Object.fromEntries(choiceInputs.filter((c) => c.input.value).map((c) => [c.key, c.input.value])),
        conditionsMet: Object.fromEntries(conditionInputs.map((c) => [c.id, c.input.checked])),
      };
      if (mine) await updateMyCard(card.id, fields);
      else await addMyCard({ cardId: card.id, ...fields });
      s.close();
      toast(mine ? `${shortName(card)} updated` : `${shortName(card)} added`);
      render();
    },
  },
  field('Statement day', statementDay, 'The day of the month your statement is issued. Caps and reminders use it.'),
  field('Annual fee date', feeDate, 'Your card anniversary, when the next annual fee is charged.'),
  field('Card opened', opened, 'Sign-up bonus spend counts from this date.'),
  h('details', { class: 'signup', open: !!mine?.signup },
    h('summary', {}, 'Sign-up bonus'),
    field('Minimum spend in S$', signupMin),
    field('Spend by', signupDeadline),
    field('Bonus miles', signupMiles)),
  choiceInputs.map((c, i) => field('Bonus category', c.input, choiceRules[i].notes)),
  conditionInputs.map((c) => h('div', { class: 'field' },
    h('label', { class: 'toggle' }, c.input, h('span', {}, `I meet this, so count the ${c.rule.mpd} mpd bonus`)),
    h('span', { class: 'field-hint' }, `${c.rule.condition}.`))),
  h('div', { class: 'sheet-actions' },
    h('button', { type: 'submit', class: 'button primary' }, mine ? 'Save changes' : 'Add card'),
    mine ? h('button', {
      type: 'button', class: 'button danger',
      onclick: async (e) => {
        e.currentTarget.disabled = true;
        const removed = await removeMyCard(card.id);
        s.close();
        render();
        toast(`Removed ${shortName(card)}. Logged purchases stay.`, { label: 'Undo', run: async () => { await restoreMyCard(removed); render(); } });
      },
    }, 'Remove card') : null));
  s = sheet(mine ? shortName(card) : `Add ${shortName(card)}`, form);
}

/**
 * Fetches every app file and the card rules now (no waiting for the "Updated" bar), then reloads.
 * It reloads even when nothing changed, since the files may have been refreshed in the background
 * after this page loaded.
 */
async function updateApp(button) {
  const sw = navigator.serviceWorker;
  if (!sw?.controller) return location.reload();
  button.disabled = true;
  button.textContent = 'Checking for updates';
  const reg = await sw.ready;
  reg.update().catch(() => {});
  const reply = await new Promise((resolve) => {
    const channel = new MessageChannel();
    channel.port1.onmessage = (e) => resolve(e.data);
    reg.active.postMessage({ type: 'check' }, [channel.port2]);
    setTimeout(() => resolve(null), 20000);
  });
  if (reply?.reached) return location.reload();
  toast('Nothing changed: the app\'s files couldn\'t be reached. Check your connection.');
  button.disabled = false;
  button.textContent = 'Update the app';
}

function settingsSection(rerender) {
  const delay = h('input', {
    type: 'number', inputmode: 'numeric', min: 0, max: 10, value: String(state.settings.postingDelayDays ?? DEFAULT_SETTINGS.postingDelayDays),
    onchange: async () => {
      const n = Math.max(0, Math.min(10, Math.round(Number(delay.value) || 0)));
      delay.value = String(n);
      await setSetting('postingDelayDays', n);
      toast('Saved posting delay');
    },
  });
  const last = state.settings.lastExportAt;
  const update = h('button', { type: 'button', class: 'button secondary', onclick: () => updateApp(update) }, 'Update the app');
  return h('section', {},
    h('h2', { class: 'subhead' }, 'Settings'),
    field('Posting delay in days', delay, 'How long purchases take to post. Near a cap reset, purchases within this many days are marked "may count next month".'),
    h('h2', { class: 'subhead' }, 'Backup'),
    h('p', { class: 'muted small' }, last ? `Last backup ${formatDay(today(new Date(last)))}.` : 'Not backed up yet.', ' Everything is stored only on this phone.'),
    h('div', { class: 'sheet-actions' },
      h('button', { type: 'button', class: 'button primary', onclick: async () => { if (await exportBackup()) rerender(); } }, 'Export backup'),
      h('button', { type: 'button', class: 'button secondary', onclick: () => importBackup(rerender) }, 'Import backup')),
    h('h2', { class: 'subhead' }, 'App'),
    h('p', { class: 'muted small' }, 'Fetches the newest app and card rules, then reloads.'),
    update);
}

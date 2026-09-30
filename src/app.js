// App shell: loads data, routes between tabs by URL hash, re-renders the current screen.

import { load } from './db/repo.js';
import { renderWhich } from './ui/which.js';
import { renderAdd } from './ui/add.js';
import { renderHistory } from './ui/history.js';
import { renderCards } from './ui/cards.js';
import { renderOverview } from './ui/overview.js';
import { h } from './ui/dom.js';

const SCREENS = {
  which: { title: 'Which card?', render: renderWhich },
  add: { title: 'Add a purchase', render: renderAdd },
  overview: { title: 'Overview', render: renderOverview },
  history: { title: 'History', render: renderHistory },
  cards: { title: 'My cards', render: renderCards },
};

const view = document.getElementById('view');
const title = document.getElementById('title');

const go = (name) => { location.hash = name; };

function route() {
  const name = location.hash.slice(1) in SCREENS ? location.hash.slice(1) : 'which';
  const screen = SCREENS[name];
  title.textContent = screen.title;
  document.title = `${screen.title} - Miles`;
  for (const tab of document.querySelectorAll('.tabs a')) {
    if (tab.dataset.screen === name) tab.setAttribute('aria-current', 'page');
    else tab.removeAttribute('aria-current');
  }
  screen.render(view, { go });
  view.scrollTop = 0;
  window.scrollTo(0, 0);
}

async function start() {
  try {
    await load();
  } catch (err) {
    view.replaceChildren(h('section', { class: 'empty' },
      h('h2', {}, 'Couldn\'t load card data'),
      h('p', {}, `Reload the page. If it keeps happening, the card data file may have a mistake: ${err.message}`)));
    return;
  }
  window.addEventListener('hashchange', route);
  route();
}

start();

// New card rules or app code were fetched in the background: offer a reload.
function showUpdate() {
  const button = document.getElementById('update');
  if (!button.hidden) return;
  button.onclick = () => location.reload();
  button.hidden = false;
}

// Offline support, and ask the browser not to clear this site's storage under pressure.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
  navigator.serviceWorker.addEventListener('message', (e) => { if (e.data?.type === 'updated') showUpdate(); });
  // A new service worker taking over an already-controlled page means new app files too.
  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (hadController) showUpdate(); });
}
navigator.storage?.persist?.().catch(() => {});

import './styles.css';
import { registerSW } from 'virtual:pwa-register';
import { icon, type IconName } from './icons';
import { el } from './ui';
import { renderToday } from './views/today';
import { renderSupplements } from './views/supplements';
import { renderStats } from './views/stats';

type Route = 'today' | 'supplements' | 'stats';

const TABS: { route: Route; label: string; icon: IconName }[] = [
  { route: 'today', label: 'Today', icon: 'check' },
  { route: 'supplements', label: 'Supplements', icon: 'pill' },
  { route: 'stats', label: 'Progress', icon: 'chart' },
];

const app = document.querySelector<HTMLDivElement>('#app');
if (!app) throw new Error('#app is missing from index.html');

const main = el('main', { class: 'view', id: 'view' });
const nav = el('nav', { class: 'tabs', 'aria-label': 'Sections' });
app.replaceChildren(main, nav);

function parseHash(): { route: Route; params: URLSearchParams } {
  const raw = window.location.hash.replace(/^#\/?/, '');
  const [path, query] = raw.split('?');
  const route = TABS.find((tab) => tab.route === path)?.route ?? 'today';
  return { route, params: new URLSearchParams(query ?? '') };
}

function navigate(hash: string): void {
  window.location.hash = hash;
}

function drawTabs(current: Route): void {
  nav.replaceChildren(
    ...TABS.map((tab) =>
      el(
        'a',
        {
          class: `tab${tab.route === current ? ' tab--active' : ''}`,
          href: `#/${tab.route}`,
          'aria-current': tab.route === current ? 'page' : false,
        },
        [
          icon(tab.icon),
          el('span', { class: 'tab__label', text: tab.label }),
        ],
      ),
    ),
  );
}

let renderToken = 0;

async function render(): Promise<void> {
  const { route, params } = parseHash();
  const token = ++renderToken;
  drawTabs(route);
  main.scrollTo({ top: 0 });

  // Each view owns its own subtree; a newer navigation wins if one is slow.
  const target = el('div', { class: 'view__body' });
  if (route === 'today') await renderToday(target, navigate);
  else if (route === 'supplements') await renderSupplements(target, { openAddForm: params.get('add') === '1' });
  else await renderStats(target);

  if (token === renderToken) main.replaceChildren(target);
}

window.addEventListener('hashchange', () => void render());
void render();

registerSW({ immediate: true });

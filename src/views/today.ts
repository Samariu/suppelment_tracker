import { activeSupplements, logsForDate, setTaken } from '../db';
import { addDays, dayDiff, formatDateFull, isDue, todayKey } from '../schedule';
import { el, mount } from '../ui';
import type { DateKey, Supplement } from '../types';

let refreshOnReturn: AbortController | null = null;

/**
 * The checklist. Only today and yesterday are reachable — older days stay
 * as they were logged, so the adherence numbers mean something.
 */
export async function renderToday(root: HTMLElement, navigate: (hash: string) => void): Promise<void> {
  let viewing: DateKey = todayKey();

  const draw = async (): Promise<void> => {
    const today = todayKey();
    const yesterday = addDays(today, -1);
    // The day can roll over while the app sits open on a phone.
    if (viewing !== today && viewing !== yesterday) viewing = today;

    const [supplements, logs] = await Promise.all([activeSupplements(), logsForDate(viewing)]);
    const takenIds = new Set(logs.map((l) => l.supplementId));
    const due = supplements.filter((s) => isDue(s, viewing));
    const takenCount = due.filter((s) => takenIds.has(s.id)).length;

    const toggle = (key: DateKey, label: string): HTMLElement =>
      el('button', {
        class: `segment${viewing === key ? ' segment--active' : ''}`,
        type: 'button',
        text: label,
        'aria-pressed': viewing === key,
        onClick: () => {
          viewing = key;
          void draw();
        },
      });

    const row = (supplement: Supplement): HTMLElement => {
      const isTaken = takenIds.has(supplement.id);
      return el(
        'button',
        {
          class: `dose${isTaken ? ' dose--taken' : ''}`,
          type: 'button',
          role: 'checkbox',
          'aria-checked': isTaken,
          onClick: async () => {
            await setTaken(viewing, supplement.id, !isTaken);
            await draw();
          },
        },
        [
          el('span', { class: 'dose__check', 'aria-hidden': 'true', text: isTaken ? '✓' : '' }),
          el('span', { class: 'dose__name', text: supplement.name }),
        ],
      );
    };

    const progress = due.length === 0 ? 0 : takenCount / due.length;

    // Distinguish "nothing scheduled today" from "you hadn't started tracking yet",
    // which is what Yesterday looks like on the day you set the app up.
    const beforeTracking =
      supplements.length > 0 && supplements.every((s) => dayDiff(s.startDate, viewing) < 0);

    const emptyTitle = !supplements.length
      ? "You haven't added any supplements yet."
      : beforeTracking
        ? 'You started tracking today.'
        : 'Nothing due on this day.';
    const emptyHint = !supplements.length
      ? 'Add your first one to start tracking.'
      : beforeTracking
        ? "There's nothing to fill in for yesterday."
        : 'Everything you take is scheduled for another day.';

    const body = due.length
      ? el('div', { class: 'doses' }, due.map(row))
      : el('div', { class: 'empty' }, [
          el('p', { class: 'empty__title', text: emptyTitle }),
          el('p', { class: 'empty__hint', text: emptyHint }),
          !supplements.length &&
            el('button', {
              class: 'button button--primary',
              type: 'button',
              text: 'Add a supplement',
              onClick: () => navigate('#/supplements?add=1'),
            }),
        ]);

    mount(
      root,
      el('header', { class: 'view__header' }, [
        el('div', { class: 'segments', role: 'group', 'aria-label': 'Choose day' }, [
          toggle(yesterday, 'Yesterday'),
          toggle(today, 'Today'),
        ]),
        el('p', { class: 'view__date', text: formatDateFull(viewing) }),
      ]),
      el('section', { class: 'summary' }, [
        el('p', {
          class: 'summary__count',
          text: due.length ? `${takenCount} of ${due.length} taken` : 'Nothing due',
        }),
        el(
          'div',
          {
            class: 'bar',
            role: 'progressbar',
            'aria-valuemin': '0',
            'aria-valuemax': String(due.length),
            'aria-valuenow': String(takenCount),
          },
          [el('div', { class: 'bar__fill', style: `width:${Math.round(progress * 100)}%` })],
        ),
        due.length > 0 &&
          takenCount === due.length &&
          el('p', { class: 'summary__done', text: 'All done for this day.' }),
      ]),
      body,
    );
  };

  await draw();

  // Ensure a stale "Today" doesn't linger after the app is left open overnight.
  // The previous view's listener is dropped so navigating back and forth cannot
  // pile them up.
  refreshOnReturn?.abort();
  refreshOnReturn = new AbortController();
  document.addEventListener(
    'visibilitychange',
    () => {
      if (!document.hidden && root.isConnected) void draw();
    },
    { signal: refreshOnReturn.signal },
  );
}

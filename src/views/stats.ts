import { allLogs, allSupplements, clearAll } from '../db';
import { downloadBackup, importBackup } from '../backup';
import { adherence, adherenceBySupplement, buildHeatmap, type HeatCell } from '../stats';
import { formatDateFull, todayKey } from '../schedule';
import { el, mount, percent, toast } from '../ui';

const WEEK_COUNT = 12;
const DAY_LABELS = ['Mon', '', 'Wed', '', 'Fri', '', 'Sun'] as const;

const cellTitle = (cell: HeatCell): string => {
  if (cell.isFuture) return formatDateFull(cell.date);
  if (cell.due === 0) return `${formatDateFull(cell.date)} — nothing due`;
  return `${formatDateFull(cell.date)} — ${cell.taken} of ${cell.due} taken`;
};

/** Heatmap, adherence figures, and the local-data controls. */
export async function renderStats(root: HTMLElement): Promise<void> {
  const draw = async (): Promise<void> => {
    const today = todayKey();
    const [supplements, logs] = await Promise.all([allSupplements(), allLogs()]);
    const active = supplements.filter((s) => !s.archivedAt);
    const last7 = adherence(supplements, logs, today, 7);
    const last30 = adherence(supplements, logs, today, 30);
    const heatmap = buildHeatmap(supplements, logs, today, WEEK_COUNT);
    const perSupplement = adherenceBySupplement(active, logs, today, 30);

    const grid = el(
      'div',
      { class: 'heatmap__grid' },
      heatmap.weeks.map((week) =>
        el(
          'div',
          { class: 'heatmap__week' },
          week.map((cell) => {
            if (!cell) return el('span', { class: 'heat heat--pad' });
            if (cell.isFuture || cell.isBeforeTracking) return el('span', { class: 'heat heat--pad' });
            const modifier = cell.level === null ? 'heat--none' : `heat--l${cell.level}`;
            return el('span', { class: `heat ${modifier}`, title: cellTitle(cell) });
          }),
        ),
      ),
    );

    const stat = (label: string, value: string, detail: string): HTMLElement =>
      el('div', { class: 'stat' }, [
        el('p', { class: 'stat__value', text: value }),
        el('p', { class: 'stat__label', text: label }),
        el('p', { class: 'stat__detail', text: detail }),
      ]);

    const importInput = el('input', {
      class: 'visually-hidden',
      type: 'file',
      accept: 'application/json,.json',
      id: 'import-file',
      onChange: async (event: Event) => {
        const input = event.target as HTMLInputElement;
        const file = input.files?.[0];
        input.value = '';
        if (!file) return;
        if (!window.confirm('Importing replaces everything currently stored. Continue?')) return;
        try {
          const result = await importBackup(await file.text());
          toast(`Imported ${result.supplements} supplements and ${result.logs} logged days.`);
          await draw();
        } catch (error) {
          toast(error instanceof Error ? error.message : 'Import failed.');
        }
      },
    });

    mount(
      root,
      el('header', { class: 'view__header' }, [el('h1', { class: 'view__title', text: 'Progress' })]),

      el('section', { class: 'card' }, [
        el('h2', { class: 'card__title', text: 'Adherence' }),
        el('div', { class: 'stats' }, [
          stat('Last 7 days', percent(last7.ratio), `${last7.taken} of ${last7.due} doses`),
          stat('Last 30 days', percent(last30.ratio), `${last30.taken} of ${last30.due} doses`),
        ]),
      ]),

      el('section', { class: 'card' }, [
        el('h2', { class: 'card__title', text: `Last ${WEEK_COUNT} weeks` }),
        el('div', { class: 'heatmap' }, [
          el('div', { class: 'heatmap__days' }, DAY_LABELS.map((label) =>
            el('span', { class: 'heatmap__day', text: label }),
          )),
          grid,
        ]),
        el('div', { class: 'legend' }, [
          el('span', { class: 'legend__label', text: 'None' }),
          ...[0, 1, 2, 3, 4].map((level) => el('span', { class: `heat heat--l${level}` })),
          el('span', { class: 'legend__label', text: 'All' }),
        ]),
      ]),

      el('section', { class: 'card' }, [
        el('h2', { class: 'card__title', text: 'By supplement · last 30 days' }),
        perSupplement.length
          ? el(
              'ul',
              { class: 'bars' },
              perSupplement.map(({ supplement, taken, due, ratio }) =>
                el('li', { class: 'bars__item' }, [
                  el('div', { class: 'bars__head' }, [
                    el('span', { class: 'bars__name', text: supplement.name }),
                    el('span', { class: 'bars__value', text: percent(ratio) }),
                  ]),
                  el('div', { class: 'bar' }, [
                    el('div', {
                      class: 'bar__fill',
                      style: `width:${Math.round((ratio ?? 0) * 100)}%`,
                    }),
                  ]),
                  el('p', {
                    class: 'bars__detail',
                    text: due === 0 ? 'Nothing was due yet' : `${taken} of ${due} doses`,
                  }),
                ]),
              ),
            )
          : el('p', { class: 'empty__hint', text: 'Add a supplement to start collecting history.' }),
      ]),

      el('section', { class: 'card' }, [
        el('h2', { class: 'card__title', text: 'Your data' }),
        el('p', {
          class: 'card__note',
          text: 'Everything lives in this browser only. Export a backup before switching phone or clearing site data.',
        }),
        el('div', { class: 'form__actions' }, [
          el('button', {
            class: 'button',
            type: 'button',
            text: 'Export backup',
            onClick: () => void downloadBackup(),
          }),
          el('label', { class: 'button', for: 'import-file' }, [document.createTextNode('Import backup')]),
          importInput,
          el('button', {
            class: 'button button--danger',
            type: 'button',
            text: 'Delete everything',
            onClick: async () => {
              if (!window.confirm('Delete all supplements and history? This cannot be undone.')) return;
              await clearAll();
              toast('All data deleted.');
              await draw();
            },
          }),
        ]),
      ]),
    );
  };

  await draw();
}

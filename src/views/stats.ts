import { allLogs, allSupplements, clearAll } from '../db';
import { downloadBackup, importBackup } from '../backup';
import { adherence, adherenceBySupplement, buildMonth, type DayCell } from '../stats';
import { addMonths, formatDateFull, formatMonthLabel, parseKey, sameMonth, startOfMonth, todayKey } from '../schedule';
import { colorVar } from '../palette';
import { icon } from '../icons';
import { el, mount, percent, toast } from '../ui';
import type { Supplement } from '../types';

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

/** Beyond this many dots a cell turns unreadable, so the rest become a +n. */
const MAX_DOTS = 8;

const dot = (supplement: Supplement, extraClass = ''): HTMLElement =>
  el('span', {
    class: `dot${extraClass}`,
    'aria-hidden': 'true',
    style: `--dot:${colorVar(supplement.color)}`,
  });

const cellTitle = (cell: DayCell): string => {
  if (cell.isFuture || cell.isBeforeTracking) return formatDateFull(cell.date);
  if (cell.due.length === 0) return `${formatDateFull(cell.date)} — nothing due`;
  return `${formatDateFull(cell.date)} — ${cell.taken.length} of ${cell.due.length} taken`;
};

/** Calendar, adherence figures, and the local-data controls. */
export async function renderStats(root: HTMLElement): Promise<void> {
  // Which month the calendar is showing, and which day the breakdown describes.
  let month = startOfMonth(todayKey());
  let selected = todayKey();

  const draw = async (): Promise<void> => {
    const today = todayKey();
    const [supplements, logs] = await Promise.all([allSupplements(), allLogs()]);
    const active = supplements.filter((s) => !s.archivedAt);
    const last7 = adherence(supplements, logs, today, 7);
    const last30 = adherence(supplements, logs, today, 30);
    const grid = buildMonth(supplements, logs, month, today);
    const perSupplement = adherenceBySupplement(active, logs, today, 30);
    const selectedCell = grid.weeks.flat().find((cell) => cell.date === selected);

    const dayButton = (cell: DayCell): HTMLElement => {
      const dots = cell.taken.slice(0, MAX_DOTS);
      const overflow = cell.taken.length - dots.length;
      const classes = [
        'day',
        !cell.inMonth && 'day--outside',
        cell.isToday && 'day--today',
        cell.date === selected && 'day--selected',
        cell.isFuture && 'day--future',
      ]
        .filter(Boolean)
        .join(' ');

      return el(
        'button',
        {
          class: classes,
          type: 'button',
          title: cellTitle(cell),
          'aria-pressed': cell.date === selected,
          'aria-label': cellTitle(cell),
          onClick: () => {
            selected = cell.date;
            // Tapping a padding day follows the calendar into that month.
            if (!cell.inMonth) month = startOfMonth(cell.date);
            void draw();
          },
        },
        [
          el('span', { class: 'day__number', text: String(parseKey(cell.date).day) }),
          el('span', { class: 'day__dots' }, [
            ...dots.map((supplement) => dot(supplement)),
            overflow > 0 && el('span', { class: 'day__more', text: `+${overflow}` }),
          ]),
        ],
      );
    };

    const monthButton = (delta: number, label: string, iconName: 'left' | 'right'): HTMLElement =>
      el(
        'button',
        {
          class: 'icon-button',
          type: 'button',
          'aria-label': label,
          onClick: () => {
            month = addMonths(month, delta);
            // Keep the breakdown on a day that is actually on screen.
            selected = sameMonth(month, today) ? today : month;
            void draw();
          },
        },
        [icon(iconName)],
      );

    const dayPanel = (): HTMLElement => {
      if (!selectedCell) return el('p', { class: 'panel__note', text: 'Pick a day to see what you took.' });
      const heading = el('p', { class: 'panel__date', text: formatDateFull(selectedCell.date) });

      if (selectedCell.isBeforeTracking) {
        return el('div', { class: 'panel' }, [
          heading,
          el('p', { class: 'panel__note', text: 'Before you started tracking.' }),
        ]);
      }
      if (selectedCell.due.length === 0) {
        return el('div', { class: 'panel' }, [
          heading,
          el('p', { class: 'panel__note', text: 'Nothing was due this day.' }),
        ]);
      }

      const takenIds = new Set(selectedCell.taken.map((s) => s.id));
      return el('div', { class: 'panel' }, [
        heading,
        el(
          'ul',
          { class: 'panel__list' },
          selectedCell.due.map((supplement) => {
            const wasTaken = takenIds.has(supplement.id);
            return el('li', { class: `panel__item${wasTaken ? '' : ' panel__item--missed'}` }, [
              dot(supplement, wasTaken ? '' : ' dot--hollow'),
              el('span', { class: 'panel__name', text: supplement.name }),
              // The state is spelled out, never left to colour alone.
              el('span', {
                class: 'panel__state',
                text: selectedCell.isFuture ? 'not yet' : wasTaken ? 'taken' : 'missed',
              }),
            ]);
          }),
        ),
      ]);
    };

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
        el('div', { class: 'calendar__head' }, [
          monthButton(-1, 'Previous month', 'left'),
          el('h2', { class: 'card__title calendar__month', text: formatMonthLabel(grid.month) }),
          monthButton(1, 'Next month', 'right'),
        ]),
        el('div', { class: 'calendar' }, [
          el(
            'div',
            { class: 'calendar__weekdays', 'aria-hidden': 'true' },
            DAY_LABELS.map((label) => el('span', { class: 'calendar__weekday', text: label })),
          ),
          el(
            'div',
            { class: 'calendar__grid' },
            grid.weeks.flat().map((cell) => dayButton(cell)),
          ),
        ]),
        !sameMonth(grid.month, today) &&
          el('button', {
            class: 'button button--quiet',
            type: 'button',
            text: 'Back to this month',
            onClick: () => {
              month = startOfMonth(today);
              selected = today;
              void draw();
            },
          }),
        dayPanel(),
      ]),

      el('section', { class: 'card' }, [
        el('h2', { class: 'card__title', text: 'By supplement · last 30 days' }),
        el('p', { class: 'card__note', text: 'These colours are the dots on the calendar.' }),
        perSupplement.length
          ? el(
              'ul',
              { class: 'bars' },
              perSupplement.map(({ supplement, taken, due, ratio }) =>
                el('li', { class: 'bars__item' }, [
                  el('div', { class: 'bars__head' }, [
                    dot(supplement),
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

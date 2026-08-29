import { allSupplements, deleteSupplement, putSupplement } from '../db';
import { describeFrequency, todayKey } from '../schedule';
import { PALETTE, colorVar, nextColor, type ColorKey } from '../palette';
import { icon } from '../icons';
import { el, mount, newId, toast } from '../ui';
import type { Frequency, Supplement } from '../types';

const WEEKDAYS = [
  { value: 1, label: 'Mon' },
  { value: 2, label: 'Tue' },
  { value: 3, label: 'Wed' },
  { value: 4, label: 'Thu' },
  { value: 5, label: 'Fri' },
  { value: 6, label: 'Sat' },
  { value: 0, label: 'Sun' },
] as const;

type Draft = {
  id: string | null;
  name: string;
  color: ColorKey;
  kind: Frequency['kind'];
  everyNDays: number;
  anchor: string;
  days: number[];
  startDate: string;
};

const draftFrom = (supplement: Supplement | null, suggestedColor: ColorKey): Draft => {
  const today = todayKey();
  if (!supplement) {
    return {
      id: null,
      name: '',
      color: suggestedColor,
      kind: 'daily',
      everyNDays: 2,
      anchor: today,
      days: [1, 4],
      startDate: today,
    };
  }
  const f = supplement.frequency;
  return {
    id: supplement.id,
    name: supplement.name,
    color: supplement.color,
    kind: f.kind,
    everyNDays: f.kind === 'interval' ? f.everyNDays : 2,
    anchor: f.kind === 'interval' ? f.anchor : supplement.startDate,
    days: f.kind === 'weekdays' ? [...f.days] : [1, 4],
    startDate: supplement.startDate,
  };
};

const frequencyFrom = (draft: Draft): Frequency => {
  if (draft.kind === 'interval') {
    return { kind: 'interval', everyNDays: Math.max(2, Math.round(draft.everyNDays)), anchor: draft.anchor };
  }
  if (draft.kind === 'weekdays') return { kind: 'weekdays', days: [...draft.days].sort((a, b) => a - b) };
  return { kind: 'daily' };
};

/** Manage the list: add, edit, reorder, archive, delete. */
export async function renderSupplements(
  root: HTMLElement,
  options: { openAddForm: boolean },
): Promise<void> {
  let editing: Draft | null = null;
  // Resolved on the first draw, once the colours already in use are known.
  let pendingAdd = options.openAddForm;
  let showArchived = false;

  const save = async (draft: Draft, existing: Supplement | null, nextSortIndex: number): Promise<void> => {
    const name = draft.name.trim();
    if (!name) {
      toast('Give it a name first.');
      return;
    }
    if (draft.kind === 'weekdays' && draft.days.length === 0) {
      toast('Pick at least one weekday.');
      return;
    }
    await putSupplement({
      id: existing?.id ?? newId(),
      name,
      frequency: frequencyFrom(draft),
      color: draft.color,
      startDate: existing?.startDate ?? draft.startDate,
      archivedAt: existing?.archivedAt ?? null,
      sortIndex: existing?.sortIndex ?? nextSortIndex,
    });
    editing = null;
    toast(existing ? 'Saved.' : `Added ${name}.`);
    await draw();
  };

  const form = (draft: Draft, existing: Supplement | null, nextSortIndex: number): HTMLElement => {
    const nameInput = el('input', {
      class: 'input',
      type: 'text',
      id: 'supp-name',
      value: draft.name,
      placeholder: 'e.g. Magnesium 200mg',
      autocomplete: 'off',
      onInput: (event: Event) => {
        draft.name = (event.target as HTMLInputElement).value;
      },
    });

    const kindButton = (kind: Frequency['kind'], label: string): HTMLElement =>
      el('button', {
        class: `segment${draft.kind === kind ? ' segment--active' : ''}`,
        type: 'button',
        text: label,
        'aria-pressed': draft.kind === kind,
        onClick: () => {
          draft.kind = kind;
          void draw();
        },
      });

    const intervalFields = el('div', { class: 'field field--inline' }, [
      el('label', { class: 'field__label', for: 'interval-n', text: 'Every' }),
      el('input', {
        class: 'input input--number',
        type: 'number',
        id: 'interval-n',
        min: '2',
        max: '30',
        step: '1',
        value: String(draft.everyNDays),
        onInput: (event: Event) => {
          draft.everyNDays = Number((event.target as HTMLInputElement).value);
        },
      }),
      el('span', { class: 'field__suffix', text: 'days, counting from' }),
      el('input', {
        class: 'input input--date',
        type: 'date',
        'aria-label': 'First day of the cycle',
        value: draft.anchor,
        onInput: (event: Event) => {
          draft.anchor = (event.target as HTMLInputElement).value;
        },
      }),
    ]);

    const weekdayFields = el(
      'div',
      { class: 'chips', role: 'group', 'aria-label': 'Weekdays' },
      WEEKDAYS.map(({ value, label }) =>
        el('button', {
          class: `chip${draft.days.includes(value) ? ' chip--active' : ''}`,
          type: 'button',
          text: label,
          'aria-pressed': draft.days.includes(value),
          onClick: () => {
            draft.days = draft.days.includes(value)
              ? draft.days.filter((d) => d !== value)
              : [...draft.days, value];
            void draw();
          },
        }),
      ),
    );

    return el('form', {
      class: 'card form',
      onSubmit: (event: Event) => {
        event.preventDefault();
        void save(draft, existing, nextSortIndex);
      },
    }, [
      el('h2', { class: 'card__title', text: existing ? 'Edit supplement' : 'New supplement' }),
      el('div', { class: 'field' }, [
        el('label', { class: 'field__label', for: 'supp-name', text: 'Name' }),
        nameInput,
        el('p', { class: 'field__hint', text: 'Include the dose if you want to see it on the checklist.' }),
      ]),
      el('div', { class: 'field' }, [
        el('span', { class: 'field__label', id: 'colour-label', text: 'Colour' }),
        el(
          'div',
          { class: 'swatches', role: 'radiogroup', 'aria-labelledby': 'colour-label' },
          PALETTE.map(({ key, label }) =>
            el('button', {
              class: `swatch${draft.color === key ? ' swatch--active' : ''}`,
              type: 'button',
              role: 'radio',
              'aria-checked': draft.color === key,
              'aria-label': label,
              title: label,
              style: `--swatch:${colorVar(key)}`,
              onClick: () => {
                draft.color = key;
                void draw();
              },
            }),
          ),
        ),
        el('p', { class: 'field__hint', text: 'Used for its dots on the calendar.' }),
      ]),
      el('div', { class: 'field' }, [
        el('span', { class: 'field__label', text: 'How often' }),
        el('div', { class: 'segments segments--grid' }, [
          kindButton('daily', 'Every day'),
          kindButton('interval', 'Every N days'),
          kindButton('weekdays', 'Certain days'),
        ]),
      ]),
      draft.kind === 'interval' && intervalFields,
      draft.kind === 'weekdays' && weekdayFields,
      el('p', { class: 'field__preview', text: describeFrequency(frequencyFrom(draft)) }),
      el('div', { class: 'form__actions' }, [
        el('button', { class: 'button button--primary', type: 'submit', text: existing ? 'Save' : 'Add' }),
        el('button', {
          class: 'button',
          type: 'button',
          text: 'Cancel',
          onClick: () => {
            editing = null;
            void draw();
          },
        }),
      ]),
    ]);
  };

  const draw = async (): Promise<void> => {
    const supplements = await allSupplements();
    const active = supplements.filter((s) => !s.archivedAt);
    const archived = supplements.filter((s) => s.archivedAt);
    const nextSortIndex = supplements.reduce((max, s) => Math.max(max, s.sortIndex), -1) + 1;
    const suggestedColor = nextColor(active.map((s) => s.color));

    if (pendingAdd) {
      pendingAdd = false;
      editing = draftFrom(null, suggestedColor);
    }

    const move = async (supplement: Supplement, delta: number): Promise<void> => {
      const index = active.findIndex((s) => s.id === supplement.id);
      const swap = active[index + delta];
      if (!swap) return;
      // Rewrite both indices so the ordering stays stable even if it was sparse.
      await putSupplement({ ...supplement, sortIndex: swap.sortIndex });
      await putSupplement({ ...swap, sortIndex: supplement.sortIndex });
      await draw();
    };

    const item = (supplement: Supplement, index: number): HTMLElement =>
      el('li', { class: 'supp' }, [
        el('span', {
          class: 'dot dot--lg',
          'aria-hidden': 'true',
          style: `--dot:${colorVar(supplement.color)}`,
        }),
        el('div', { class: 'supp__main' }, [
          el('p', { class: 'supp__name', text: supplement.name }),
          el('p', { class: 'supp__freq', text: describeFrequency(supplement.frequency) }),
        ]),
        el('div', { class: 'supp__actions' }, [
          !supplement.archivedAt &&
            el(
              'button',
              {
                class: 'icon-button',
                type: 'button',
                'aria-label': `Move ${supplement.name} up`,
                disabled: index === 0,
                onClick: () => void move(supplement, -1),
              },
              [icon('up')],
            ),
          !supplement.archivedAt &&
            el(
              'button',
              {
                class: 'icon-button',
                type: 'button',
                'aria-label': `Move ${supplement.name} down`,
                disabled: index === active.length - 1,
                onClick: () => void move(supplement, 1),
              },
              [icon('down')],
            ),
          el(
            'button',
            {
              class: 'icon-button',
              type: 'button',
              'aria-label': `Edit ${supplement.name}`,
              onClick: () => {
                editing = draftFrom(supplement, suggestedColor);
                void draw();
              },
            },
            [icon('edit')],
          ),
          el('button', {
            class: 'icon-button',
            type: 'button',
            'aria-label': supplement.archivedAt
              ? `Restore ${supplement.name}`
              : `Archive ${supplement.name}`,
            onClick: async () => {
              await putSupplement({
                ...supplement,
                archivedAt: supplement.archivedAt ? null : new Date().toISOString(),
              });
              toast(supplement.archivedAt ? `Restored ${supplement.name}.` : `Archived ${supplement.name}.`);
              await draw();
            },
          }, [icon(supplement.archivedAt ? 'restore' : 'archive')]),
          supplement.archivedAt &&
            el('button', {
              class: 'icon-button icon-button--danger',
              type: 'button',
              'aria-label': `Delete ${supplement.name} permanently`,
              onClick: async () => {
                const ok = window.confirm(
                  `Delete "${supplement.name}" and its whole history? This cannot be undone.`,
                );
                if (!ok) return;
                await deleteSupplement(supplement.id);
                toast('Deleted.');
                await draw();
              },
            }, [icon('trash')]),
        ]),
      ]);

    const editingExisting = editing?.id ? (supplements.find((s) => s.id === editing?.id) ?? null) : null;

    mount(
      root,
      el('header', { class: 'view__header' }, [
        el('h1', { class: 'view__title', text: 'Supplements' }),
        !editing &&
          el('button', {
            class: 'button button--primary',
            type: 'button',
            text: '+ Add',
            onClick: () => {
              editing = draftFrom(null, suggestedColor);
              void draw();
            },
          }),
      ]),
      editing && form(editing, editingExisting, nextSortIndex),
      active.length
        ? el('ul', { class: 'supps' }, active.map(item))
        : el('div', { class: 'empty' }, [
            el('p', { class: 'empty__title', text: 'No supplements yet.' }),
            el('p', { class: 'empty__hint', text: 'Add one and it will appear on your checklist.' }),
          ]),
      archived.length > 0 &&
        el('section', { class: 'archive' }, [
          el('button', {
            class: 'button button--quiet',
            type: 'button',
            text: `${showArchived ? 'Hide' : 'Show'} archived (${archived.length})`,
            'aria-expanded': showArchived,
            onClick: () => {
              showArchived = !showArchived;
              void draw();
            },
          }),
          showArchived &&
            el('ul', { class: 'supps supps--archived' }, archived.map((s, i) => item(s, i))),
        ]),
    );
  };

  await draw();
}

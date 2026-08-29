type Props = Record<string, unknown>;
type Child = Node | string | null | undefined | false;

/**
 * Minimal element builder. Text always goes through textContent, so user-entered
 * supplement names can never be interpreted as markup.
 */
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Props = {},
  children: Child[] = [],
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value === undefined || value === null) continue;
    if (key === 'class') node.className = String(value);
    else if (key === 'text') node.textContent = String(value);
    else if (key === 'dataset') Object.assign(node.dataset, value as Record<string, string>);
    else if (key.startsWith('on') && typeof value === 'function') {
      node.addEventListener(key.slice(2).toLowerCase(), value as EventListener);
    } else if (key.startsWith('aria-')) {
      // ARIA states are spelled out: `aria-checked="false"` says unchecked,
      // while omitting it or leaving it empty says nothing at all.
      node.setAttribute(key, String(value));
    } else if (value === false) continue;
    else if (value === true) node.setAttribute(key, '');
    else node.setAttribute(key, String(value));
  }
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    node.append(child);
  }
  return node;
}

/** Replace a node's contents, dropping `false`/`null` children from `cond && el(...)`. */
export function mount(node: HTMLElement, ...children: Child[]): void {
  node.replaceChildren(
    ...children.filter((child): child is Node | string => Boolean(child) || child === ''),
  );
}

export function percent(ratio: number | null): string {
  return ratio === null ? '–' : `${Math.round(ratio * 100)}%`;
}

let toastTimer: number | undefined;

/** Brief confirmation message at the bottom of the screen. */
export function toast(message: string): void {
  let node = document.querySelector<HTMLDivElement>('.toast');
  if (!node) {
    node = el('div', { class: 'toast', role: 'status', 'aria-live': 'polite' });
    document.body.append(node);
  }
  node.textContent = message;
  node.classList.add('toast--visible');
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => node?.classList.remove('toast--visible'), 2400);
}

export function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

const SVG_NS = 'http://www.w3.org/2000/svg';

const PATHS = {
  up: 'M12 19V5M5 12l7-7 7 7',
  down: 'M12 5v14M19 12l-7 7-7-7',
  edit: 'M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z',
  archive: 'M3 8h18v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2ZM3 8V5a1 1 0 0 1 1-1h16a1 1 0 0 1 1 1v3M10 12h4',
  restore: 'M3 12a9 9 0 1 0 3-6.7L3 8m0-5v5h5',
  trash: 'M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13M10 11v6M14 11v6',
  check: 'M20 6 9 17l-5-5',
  pill: 'M10.5 20.5a5 5 0 0 1-7-7l7-7a5 5 0 0 1 7 7ZM8.5 8.5l7 7',
  chart: 'M3 3v16a2 2 0 0 0 2 2h16M7 15l4-5 3 3 5-6',
} as const;

export type IconName = keyof typeof PATHS;

/** Stroked 24px icon, sized and coloured by the surrounding button. */
export function icon(name: IconName): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.8');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('class', 'icon');
  const path = document.createElementNS(SVG_NS, 'path');
  path.setAttribute('d', PATHS[name]);
  svg.append(path);
  return svg;
}

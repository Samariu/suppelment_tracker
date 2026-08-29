/**
 * Keeps the app shell exactly as tall as the part of the screen the user can
 * actually see.
 *
 * Mobile browsers resize the viewport as their toolbars slide in and out, and
 * they let the whole document rubber-band past its end. Either one drags a
 * bottom bar out of view. The stylesheet locks the document and sizes the shell
 * with `dvh`; this fills the gaps `dvh` leaves — most visibly the on-screen
 * keyboard, which shrinks the visual viewport without changing `dvh` at all.
 */
export function trackViewportHeight(): void {
  const root = document.documentElement;

  const apply = (): void => {
    const viewport = window.visualViewport;
    // While pinch-zoomed the visual viewport is a crop of the page rather than
    // the window, so sizing to it would shrink the app under the user.
    const height = viewport && viewport.scale <= 1.01 ? viewport.height : window.innerHeight;
    root.style.setProperty('--app-height', `${Math.round(height)}px`);
  };

  apply();

  window.visualViewport?.addEventListener('resize', apply);
  window.visualViewport?.addEventListener('scroll', apply);
  window.addEventListener('resize', apply);
  window.addEventListener('orientationchange', apply);
  // Restoring from the back/forward cache can hand back a stale height.
  window.addEventListener('pageshow', apply);
}

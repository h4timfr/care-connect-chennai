import { useEffect, useRef, type RefObject } from "react";

// Every route renders its own shell, so a shell mounting after the first page load means the
// user navigated to a different page (switching between a page's loading and loaded states
// keeps the same shell instance, and filter/tab changes don't remount it).
let firstShellMounted = false;

/**
 * After client-side navigation, move focus to the new page's main content so screen readers
 * announce it and keyboard users continue from it instead of from a link that no longer exists.
 * `ready` is false while the shell shows a full-page loader without its <main> element.
 */
export function useFocusMainOnNavigate(main: RefObject<HTMLElement | null>, ready = true) {
  const pending = useRef<boolean | null>(null);

  useEffect(() => {
    if (pending.current === null) {
      pending.current = firstShellMounted;
      firstShellMounted = true;
    }
    const element = main.current;
    if (!pending.current || !ready || !element) return;
    pending.current = false;
    if (!element.contains(document.activeElement)) element.focus({ preventScroll: true });
  }, [main, ready]);
}

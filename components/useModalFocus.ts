import { useEffect, useRef } from 'react';

/** Focus management for the existing game-state dialogs, including mandatory decisions. */
export default function useModalFocus(active: boolean, onEscape?: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  const escapeRef = useRef(onEscape);
  escapeRef.current = onEscape;
  useEffect(() => {
    if (!active || !ref.current) return;
    const panel = ref.current;
    const previous = document.activeElement as HTMLElement | null;
    const heading = panel.querySelector<HTMLElement>('h2, h3') ?? panel;
    heading.tabIndex = -1;
    const frame = requestAnimationFrame(() => heading.focus({ preventScroll: true }));
    const focusable = () => [...panel.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), summary, [tabindex="0"]')]
      .filter(element => element.getClientRects().length > 0);
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault(); event.stopPropagation(); escapeRef.current?.();
      }
      if (event.key !== 'Tab') return;
      const controls = focusable();
      const index = controls.indexOf(document.activeElement as HTMLElement);
      if (!controls.length) { event.preventDefault(); heading.focus(); }
      else if (event.shiftKey && index <= 0) { event.preventDefault(); controls.at(-1)!.focus(); }
      else if (!event.shiftKey && (index < 0 || index === controls.length - 1)) { event.preventDefault(); controls[0].focus(); }
    };
    panel.addEventListener('keydown', keydown);
    return () => {
      cancelAnimationFrame(frame);
      panel.removeEventListener('keydown', keydown);
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, [active]);
  return ref;
}

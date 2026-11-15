import React, { useEffect, useId, useRef } from 'react';

/** Native modal for optional tools. Closing a tool never submits a game command. */
export default function GameDialog({ title, onClose, children, className = '' }: {
  title: string; onClose: () => void; children: React.ReactNode; className?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const dialog = ref.current!;
    const previous = document.activeElement as HTMLElement | null;
    dialog.showModal();
    return () => {
      dialog.close();
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, []);
  return <dialog ref={ref} className={`game-dialog ${className}`} aria-labelledby={titleId}
    onCancel={event => { event.preventDefault(); closeRef.current(); }}
    onKeyDown={event => {
      if (event.key !== 'Tab') return;
      const controls = [...event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), summary, [tabindex="0"]')]
        .filter(element => element.getClientRects().length > 0);
      const index = controls.indexOf(document.activeElement as HTMLElement);
      if (controls.length && event.shiftKey && index <= 0) { event.preventDefault(); controls.at(-1)!.focus(); }
      else if (controls.length && !event.shiftKey && (index < 0 || index === controls.length - 1)) { event.preventDefault(); controls[0].focus(); }
    }}>
    <header className="game-dialog-heading">
      <h2 id={titleId}>{title}</h2>
      <button type="button" onClick={onClose} aria-label={`关闭${title}`}>关闭</button>
    </header>
    <div className="game-dialog-body custom-scrollbar">{children}</div>
  </dialog>;
}

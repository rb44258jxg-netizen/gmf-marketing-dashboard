import { useEffect } from 'react';

/**
 * Stäng en modal när användaren trycker ESC. Live-test 2026-05-06 visade att
 * inga av våra modaler reagerade på ESC — bara backdrop-klick stängde dem.
 *
 * Användning i en modal-komponent:
 *   useEscapeKey(onClose);
 */
export function useEscapeKey(onClose: () => void) {
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);
}

import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * Återställer scrollpositionen vid navigering. Utan detta behåller webbläsaren
 * scrollpositionen från listan, så den som klickar på en cup längre ner hamnar
 * mitt på detaljsidan istället för högst upp.
 *
 * Sökparametrar ignoreras avsiktligt – filterändringar ska inte scrolla.
 */
export function ScrollToTop() {
  const { pathname } = useLocation();

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  return null;
}

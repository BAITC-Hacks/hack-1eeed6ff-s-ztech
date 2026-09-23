import type { Theme } from '../theme';
import { FreedomLogo } from './FreedomLogo';
import { ThemeSwitch } from './ThemeSwitch';
import { Icon } from './Icon';
import { useEffect, useRef, useState } from 'react';

const entryKey = 'neverlose.entered';
export function enteredSession() {
  try { return sessionStorage.getItem(entryKey) === 'yes'; }
  catch { return false; }
}
export function rememberEntry() {
  try { sessionStorage.setItem(entryKey, 'yes'); }
  catch { /* Entering still works without storage. */ }
}
export function Welcome({ theme, toggleTheme, enter }: { theme: Theme; toggleTheme: () => void; enter: () => void }) {
  const [leaving, setLeaving] = useState(false);
  const enterRef = useRef(enter); enterRef.current = enter;
  useEffect(() => {
    if (!leaving) return;
    const timer = window.setTimeout(() => enterRef.current(), 160);
    return () => window.clearTimeout(timer);
  }, [leaving]);
  function beginEntry() {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) enter();
    else setLeaving(true);
  }
  return <div className={`welcome${leaving ? ' welcome-leaving' : ''}`}>
    <header className="welcome-header"><span><strong>Neverlose</strong><span> / Finance</span></span><ThemeSwitch theme={theme} toggle={toggleTheme} /></header>
    <main className="welcome-main">
      <div className="welcome-brands"><FreedomLogo /><span className="welcome-divider" aria-hidden="true" /><span className="welcome-team">Neverlose</span></div>
      <h1>Граф денежных переводов</h1>
      <p>Связи, основания и ограничения —<br />в одном рабочем пространстве.</p>
      <button className="welcome-enter" disabled={leaving} onClick={beginEntry}>Открыть платформу<Icon name="arrow" /></button>
    </main>
    <footer className="welcome-footer"><span>HackAlem · Finance</span><span>Команда Neverlose</span><span>Роли — проверяемые гипотезы</span></footer>
  </div>;
}

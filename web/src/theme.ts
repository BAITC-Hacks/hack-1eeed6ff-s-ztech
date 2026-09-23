export type Theme = 'light' | 'dark';
export const themeStorageKey = 'neverlose.theme';

export function initialTheme(): Theme {
  try {
    const saved = localStorage.getItem(themeStorageKey);
    if (saved === 'light' || saved === 'dark') return saved;
  } catch { /* A blocked preference store must not prevent opening the workspace. */ }
  return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#111512' : '#f5f6f7');
}

export function rememberTheme(theme: Theme) {
  try { localStorage.setItem(themeStorageKey, theme); }
  catch { /* Theme still works for this visit when storage is unavailable. */ }
}

import type { Theme } from '../theme';
import { Icon } from './Icon';

export function ThemeSwitch({ theme, toggle }: { theme: Theme; toggle: () => void }) {
  return <button className="theme-switch" role="switch" aria-label="Тёмная тема" aria-checked={theme === 'dark'} onClick={toggle} title={theme === 'dark' ? 'Включить светлую тему' : 'Включить тёмную тему'}><span className="theme-option sun"><Icon name="sun" /></span><span className="theme-option moon"><Icon name="moon" /></span></button>;
}

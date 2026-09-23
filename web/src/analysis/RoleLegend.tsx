import { roles, roleLabels } from '../domain';
import { networkStyleFor } from '../network';
import type { Theme } from '../theme';
import './role-legend.css';

export function RoleLegend({ theme }: { theme: Theme }) {
  const styles = networkStyleFor(theme);
  return <ul className="role-legend" aria-label="Цвета ролей узлов">{roles.map(role => {
    const entry = styles.find(item => item.selector === `node[role = "${role}"]`);
    const color = entry && 'style' in entry ? String((entry.style as Record<string, unknown>)['background-color']) : undefined;
    return <li key={role}><i aria-hidden="true" style={{ backgroundColor: color }} />{roleLabels[role]}</li>;
  })}</ul>;
}

import type { Candidate } from '../domain';
export function RuleChecks({ candidate }: { candidate: Candidate }) {
  return <ul className="rule-checks">{candidate.checks.map((check, i) => <li key={`${check.key}-${i}`}><span className={check.passed ? 'passed' : 'warning'}>{check.passed ? 'Выполнено' : 'Не выполнено'}</span><p>{check.text}</p><span className="mono caption">{check.key}: {check.actual ?? 'нет наблюдения'} {check.operator} {check.threshold ?? 'не задан'}</span></li>)}</ul>;
}

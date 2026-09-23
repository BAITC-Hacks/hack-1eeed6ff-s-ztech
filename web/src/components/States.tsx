export function Failure({ error, retry }: { error: Error; retry: () => void }) {
  return <div className="state error" role="alert"><strong>Не удалось загрузить данные</strong><p>{error.message}</p><button onClick={retry}>Повторить</button></div>;
}
export function Loading({ text = 'Загрузка данных API…' }: { text?: string }) {
  return <p className="state" role="status">{text}</p>;
}

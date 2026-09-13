export function LoadingState({ label = 'Loading current data…' }: { label?: string }) {
  return (
    <output className="state-panel">
      <span className="spinner" />
      {label}
    </output>
  );
}

export function ErrorState({ message, retry }: { message: string; retry?: () => void }) {
  return (
    <div className="state-panel error" role="alert">
      <div>
        <strong>Something needs attention</strong>
        <p>{message}</p>
      </div>
      {retry ? (
        <button className="button secondary" type="button" onClick={retry}>
          Retry
        </button>
      ) : null}
    </div>
  );
}

export function EmptyState({
  title,
  message,
  action,
}: { title: string; message: string; action?: React.ReactNode }) {
  return (
    <div className="empty-state">
      <span className="empty-icon">◇</span>
      <h2>{title}</h2>
      <p>{message}</p>
      {action}
    </div>
  );
}

import { SkeletonRows } from "./DataTable";

export function LoadingState({
  rows = 5,
  label = "Loading",
  message,
}: {
  rows?: number;
  label?: string;
  message?: string;
}) {
  const lbl = message ?? label;
  return (
    <div className="p-4" role="status" aria-live="polite" aria-label={lbl}>
      <SkeletonRows rows={rows} />
      <span className="sr-only">{lbl}</span>
    </div>
  );
}

/** @deprecated Use LoadingState */
export const Loading = LoadingState;

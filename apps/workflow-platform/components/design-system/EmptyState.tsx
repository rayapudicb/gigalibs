import type { ReactNode } from "react";
import { Inbox } from "lucide-react";

export function EmptyState({
  message,
  detail,
  title,
  description,
  action,
  icon,
}: {
  message?: string;
  detail?: string;
  title?: string;
  description?: string;
  action?: ReactNode;
  icon?: ReactNode;
}) {
  const heading = title ?? message ?? "No data";
  const body = description ?? detail;
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-lg border border-ui-border-base bg-ui-bg-subtle text-ui-fg-subtle">
        {icon ?? <Inbox className="h-5 w-5" aria-hidden="true" />}
      </div>
      <p className="text-sm font-medium text-ui-fg-base">{heading}</p>
      {body && <p className="mt-1 max-w-sm text-xs text-ui-fg-muted">{body}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

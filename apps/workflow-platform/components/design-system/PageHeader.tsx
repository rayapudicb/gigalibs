import type { ReactNode } from "react";
import { Heading } from "./ui-primitives";

export function PageHeader({
  title,
  subtitle,
  description,
  action,
  actions,
}: {
  title: string;
  subtitle?: string;
  description?: string;
  action?: ReactNode;
  actions?: ReactNode;
}) {
  const sub = subtitle ?? description;
  const act = action ?? actions;
  return (
    <div className="flex items-start justify-between gap-4 mb-6">
      <div className="min-w-0">
        <Heading level="h1">{title}</Heading>
        {sub && (
          <p className="mt-1 text-sm text-ui-fg-subtle">{sub}</p>
        )}
      </div>
      {act ? <div className="flex-shrink-0">{act}</div> : null}
    </div>
  );
}

export function PageShell({
  children,
  compact = false,
  className = "",
}: {
  children: ReactNode;
  compact?: boolean;
  className?: string;
}) {
  return (
    <div className={`w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 ${compact ? "py-4" : "py-8"} ${className}`.trim()}>
      {children}
    </div>
  );
}

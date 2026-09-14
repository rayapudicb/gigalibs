import type { ReactNode } from 'react';

interface PageShellProps {
  titleId?: string;
  title: string;
  description: string;
  eyebrow?: string;
  actions?: ReactNode;
  children: ReactNode;
}

export function PageShell({
  titleId,
  title,
  description,
  eyebrow,
  actions,
  children,
}: PageShellProps) {
  return (
    <div className="mx-auto flex w-full max-w-[1500px] flex-col gap-y-4 p-4 md:p-8">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          {eyebrow ? (
            <p className="mb-1 text-xs font-semibold uppercase tracking-[0.12em] text-zinc-400">
              {eyebrow}
            </p>
          ) : null}
          <h1 id={titleId} className="text-xl font-bold tracking-tight text-zinc-900">
            {title}
          </h1>
          <p className="mt-1 max-w-3xl text-xs text-zinc-500">
            {description}
          </p>
        </div>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>
      {children}
    </div>
  );
}

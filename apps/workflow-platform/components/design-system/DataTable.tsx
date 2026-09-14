import type { ReactNode } from "react";

export interface ColumnDefinition<T = any> {
  header: string;
  cell: (row: T) => ReactNode;
}

export interface DataTableProps<T = any> {
  headers?: string[];
  children?: ReactNode;
  columns?: ColumnDefinition<T>[];
  data?: T[];
  filters?: ReactNode;
  emptyState?: ReactNode;
  isEmpty?: boolean;
  loading?: boolean;
  error?: ReactNode;
  className?: string;
}

export function DataTable<T = any>({
  headers,
  children,
  columns,
  data,
  filters,
  emptyState,
  isEmpty = false,
  loading = false,
  error,
  className = "",
}: DataTableProps<T>) {
  const actualHeaders = columns ? columns.map((c) => c.header) : headers ?? [];
  const effectiveEmpty = isEmpty || (Boolean(data) && data!.length === 0);

  return (
    <div className={className}>
      {filters && <div className="border-b border-ui-border-base px-4 py-3">{filters}</div>}
      {error}
      {loading ? (
        <div className="px-4 py-3">
          <LoadingRows />
        </div>
      ) : effectiveEmpty && emptyState ? (
        emptyState
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-xs">
            <thead>
              <tr className="border-b border-ui-border-base bg-ui-bg-subtle">
                {actualHeaders.map((header) => (
                  <th
                    key={header}
                    scope="col"
                    className="px-4 py-2.5 text-left text-xs font-medium text-ui-fg-muted"
                  >
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-ui-border-base bg-ui-bg-base">
              {columns && data
                ? data.map((row, rowIdx) => (
                    <tr key={rowIdx} className="hover:bg-ui-bg-subtle">
                      {columns.map((col, colIdx) => (
                        <td key={colIdx} className="px-4 py-3 align-middle text-ui-fg-base">
                          {col.cell(row)}
                        </td>
                      ))}
                    </tr>
                  ))
                : children}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export function Table({
  headers,
  children,
  filters,
}: {
  headers: string[];
  children: ReactNode;
  filters?: ReactNode;
}) {
  return (
    <DataTable headers={headers} filters={filters}>
      {children}
    </DataTable>
  );
}

export function Td({
  children,
  mono = false,
  align = "left",
}: {
  children: ReactNode;
  mono?: boolean;
  align?: "left" | "right";
}) {
  return (
    <td
      className={[
        "px-4 py-3 text-text-base whitespace-nowrap align-middle",
        mono ? "font-mono text-meta text-text-muted" : "",
        align === "right" ? "text-right" : "text-left",
      ].join(" ")}
    >
      {children}
    </td>
  );
}

function LoadingRows({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-2.5" aria-hidden="true">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex animate-pulse gap-4">
          <div className="h-4 w-24 flex-shrink-0 rounded-ui bg-surface-subtle" />
          <div className="h-4 flex-1 rounded-ui bg-surface-subtle" />
          <div className="h-4 w-20 flex-shrink-0 rounded-ui bg-surface-subtle" />
        </div>
      ))}
    </div>
  );
}

export function SkeletonRows({ rows = 5 }: { rows?: number }) {
  return <LoadingRows rows={rows} />;
}

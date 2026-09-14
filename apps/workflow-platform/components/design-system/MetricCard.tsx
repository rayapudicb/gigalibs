import type { ReactNode } from "react";
import Link from "next/link";
import { Text } from "./ui-primitives";
import { Container } from "./Container";

export interface MetricCardProps {
  label: string;
  value: ReactNode;
  hint?: string;
  to?: string;
  icon?: ReactNode;
}

export function MetricCard({ label, value, hint, to, icon }: MetricCardProps) {
  const valueContent = to ? (
    <Link href={to} className="text-ui-fg-base transition-colors hover:text-ui-fg-interactive">
      {value}
    </Link>
  ) : (
    value
  );

  return (
    <Container className="p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <Text size="xsmall" weight="plus" className="text-ui-fg-muted">
            {label}
          </Text>
          <div className="mt-1.5 text-page-title tabular-nums text-ui-fg-base">
            {valueContent}
          </div>
          {hint && (
            <Text size="xsmall" className="mt-1 text-ui-fg-subtle">
              {hint}
            </Text>
          )}
        </div>
        {icon && (
          <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-md border border-ui-border-base bg-ui-bg-subtle text-ui-fg-muted">
            {icon}
          </div>
        )}
      </div>
    </Container>
  );
}

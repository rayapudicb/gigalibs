import { Badge } from "./ui-primitives";

export type BadgeTone = "neutral" | "success" | "warning" | "danger" | "info" | "accent" | "green" | "red" | "blue" | "orange" | "grey" | "purple";

type UiBadgeColor = "green" | "red" | "blue" | "orange" | "grey" | "purple";

const TONE_COLOR: Record<BadgeTone, UiBadgeColor> = {
  neutral: "grey",
  success: "green",
  warning: "orange",
  danger: "red",
  info: "blue",
  accent: "blue",
  green: "green",
  red: "red",
  blue: "blue",
  orange: "orange",
  grey: "grey",
  purple: "purple",
};

const STATUS_TONE_MAP: Record<string, BadgeTone> = {
  active: "success",
  enabled: "success",
  completed: "success",
  sent: "success",
  delivered: "success",
  ok: "success",
  connected: "success",
  approved: "success",
  healthy: "success",
  current: "accent",
  recommended: "accent",
  pending: "warning",
  queued: "warning",
  draft: "warning",
  registered: "warning",
  processing: "info",
  running: "info",
  invited: "info",
  failed: "danger",
  error: "danger",
  bounced: "danger",
  rejected: "danger",
  cancelled: "neutral",
  disabled: "neutral",
  archived: "neutral",
  inactive: "neutral",
  suspended: "warning",
  revoked: "danger",
  daily: "info",
  weekly: "info",
  teams: "info",
  email: "info",
  slack: "info",
  sms: "info",
  whatsapp: "info",
  webhook: "neutral",
  local: "neutral",
};

function formatLabel(status: string): string {
  return status
    .replace(/[._]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export interface StatusBadgeProps {
  status?: string;
  tone?: BadgeTone;
  label?: string;
  children?: React.ReactNode;
}

export function StatusBadge({ status, tone, label, children }: StatusBadgeProps) {
  const effectiveStatus = (typeof children === "string" ? children : status) ?? "";
  const resolvedTone = tone ?? STATUS_TONE_MAP[effectiveStatus.toLowerCase()] ?? "neutral";
  const displayLabel = label ?? (children !== undefined ? children : formatLabel(effectiveStatus));

  return (
    <Badge size="2xsmall" color={TONE_COLOR[resolvedTone]} rounded="full">
      {displayLabel}
    </Badge>
  );
}

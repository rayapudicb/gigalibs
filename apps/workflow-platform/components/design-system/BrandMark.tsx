export function BrandMark({ label }: { label: string }) {
  const initial = label.trim().slice(0, 1).toUpperCase() || "T";

  return (
    <div
      className="flex h-9 w-9 items-center justify-center rounded-md border border-ui-border-base bg-ui-bg-subtle text-sm font-semibold text-ui-fg-base"
      aria-hidden="true"
    >
      {initial}
    </div>
  );
}

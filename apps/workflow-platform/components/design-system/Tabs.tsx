interface TabOption {
  value: string;
  label: string;
  count?: number;
}

export function Tabs({
  options,
  value,
  onChange,
}: {
  options: TabOption[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div
      className="inline-flex w-fit max-w-full flex-wrap gap-1 rounded-lg border border-ui-border-base bg-ui-bg-subtle p-1"
      role="tablist"
    >
      {options.map((opt) => {
        const selected = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(opt.value)}
            className={[
              "min-h-8 rounded-md px-3 py-1.5 text-[13px] font-medium transition-colors",
              selected
                ? "border border-ui-border-base bg-ui-bg-base text-ui-fg-base shadow-sm"
                : "border border-transparent text-ui-fg-muted hover:bg-ui-bg-base hover:text-ui-fg-base",
            ].join(" ")}
          >
            {opt.label}
            {opt.count !== undefined && (
              <span
                className={[
                  "ml-1.5 rounded-full px-1.5 py-0.5 text-xs tabular-nums",
                  selected ? "bg-ui-bg-subtle text-ui-fg-base" : "text-ui-fg-muted",
                ].join(" ")}
              >
                {opt.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

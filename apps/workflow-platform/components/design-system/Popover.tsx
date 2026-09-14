import {
  type ReactNode,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { Check } from "lucide-react";
import { renderPortal } from "./portal";

export interface PopoverItem {
  id: string;
  label: string;
  description?: string;
  selected?: boolean;
  onSelect: () => void;
}

interface MenuPosition {
  top: number;
  left: number;
  width: number;
}

function parseWidth(width: string): number {
  if (width.endsWith("rem")) return parseFloat(width) * 16;
  if (width.endsWith("px")) return parseFloat(width);
  return 256;
}

export function Popover({
  trigger,
  items,
  header,
  align = "right",
  width = "16rem",
}: {
  trigger: (props: {
    open: boolean;
    toggle: () => void;
    buttonId: string;
    panelId: string;
  }) => ReactNode;
  items: PopoverItem[];
  header?: string;
  align?: "left" | "right";
  width?: string;
}) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<MenuPosition | null>(null);
  const triggerRef = useRef<HTMLDivElement>(null);
  const buttonId = useId();
  const panelId = useId();
  const menuWidth = parseWidth(width);

  const updatePosition = () => {
    const el = triggerRef.current;
    if (!el) return;

    const rect = el.getBoundingClientRect();
    const left =
      align === "right"
        ? rect.right - menuWidth
        : rect.left;

    const clampedLeft = Math.max(
      8,
      Math.min(left, window.innerWidth - menuWidth - 8)
    );

    setPosition({
      top: rect.bottom + 6,
      left: clampedLeft,
      width: menuWidth,
    });
  };

  useLayoutEffect(() => {
    if (!open) {
      setPosition(null);
      return;
    }
    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open, align, menuWidth]);

  useEffect(() => {
    function handler(e: MouseEvent) {
      const target = e.target as Node;
      if (triggerRef.current?.contains(target)) return;
      const menu = document.getElementById(panelId);
      if (menu?.contains(target)) return;
      setOpen(false);
    }
    if (open) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open, panelId]);

  useEffect(() => {
    if (!open) return;
    function handler(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open]);

  const menu =
    open && position
      ? renderPortal(
          <div
            id={panelId}
            role="menu"
            aria-labelledby={buttonId}
            className="fixed z-[300] overflow-hidden rounded-lg border border-ui-border-base bg-ui-bg-base shadow-elevation-flyout"
            style={{
              top: position.top,
              left: position.left,
              width: position.width,
            }}
          >
            {header && (
              <div className="border-b border-ui-border-base bg-ui-bg-base px-3 py-2 text-[13px] font-medium text-ui-fg-muted">
                {header}
              </div>
            )}
            <div className="max-h-72 overflow-y-auto bg-ui-bg-base py-1">
              {items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    item.onSelect();
                    setOpen(false);
                  }}
                  className={[
                    "flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm transition-colors",
                    item.selected
                      ? "bg-ui-bg-subtle text-ui-fg-base"
                      : "text-ui-fg-base hover:bg-ui-bg-base-hover",
                  ].join(" ")}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{item.label}</span>
                    {item.description && (
                      <span className="mt-0.5 block truncate font-mono text-[13px] text-ui-fg-muted">
                        {item.description}
                      </span>
                    )}
                  </span>
                  {item.selected && (
                    <Check className="h-4 w-4 flex-shrink-0 text-ui-fg-base" aria-hidden="true" />
                  )}
                </button>
              ))}
            </div>
          </div>
        )
      : null;

  return (
    <>
      <div className="relative inline-flex" ref={triggerRef}>
        {trigger({
          open,
          toggle: () => setOpen((v) => !v),
          buttonId,
          panelId,
        })}
      </div>
      {menu}
    </>
  );
}

import { type ReactNode, useEffect, useId } from "react";
import { X } from "lucide-react";
import { renderPortal } from "./portal";

export function Drawer({
  open,
  onClose,
  title,
  children,
  footer,
  width = "30rem",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  width?: string;
}) {
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    function handler(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open) return null;

  return renderPortal(
    <div className="fixed inset-0 z-[200]">
      <button
        type="button"
        className="absolute inset-0 z-[200] bg-ui-bg-overlay"
        aria-label="Close drawer"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="absolute inset-y-0 right-0 z-[210] flex w-full max-w-full flex-col border-l border-ui-border-base bg-ui-bg-base shadow-elevation-flyout sm:max-w-[520px]"
        style={{ width: `min(100vw, ${width})` }}
      >
        <div className="flex flex-shrink-0 items-center justify-between border-b border-ui-border-base bg-ui-bg-base px-5 py-4">
          <h2 id={titleId} className="text-section-title text-ui-fg-base">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg p-1.5 text-ui-fg-muted hover:bg-ui-bg-base-hover hover:text-ui-fg-base"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto bg-ui-bg-base px-5 py-5">{children}</div>
        {footer && (
          <div className="flex-shrink-0 border-t border-ui-border-base bg-ui-bg-base px-5 py-4">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

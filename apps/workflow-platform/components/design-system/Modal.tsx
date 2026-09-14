import { type ReactNode, useEffect, useId } from "react";
import { X } from "lucide-react";
import { renderPortal } from "./portal";

export function Modal({
  open,
  onClose,
  onOpenChange,
  title,
  description,
  children,
  footer,
}: {
  open: boolean;
  onClose?: () => void;
  onOpenChange?: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const titleId = useId();

  const handleClose = () => {
    onClose?.();
    onOpenChange?.(false);
  };

  useEffect(() => {
    if (!open) return;
    function handler(e: KeyboardEvent) {
      if (e.key === "Escape") handleClose();
    }
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open]);

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
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-3 sm:p-4">
      <button
        type="button"
        className="absolute inset-0 z-[200] bg-ui-bg-overlay"
        aria-label="Close modal"
        onClick={handleClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative z-[210] flex max-h-[min(100%,calc(100vh-1.5rem))] w-full max-w-lg flex-col overflow-hidden rounded-lg border border-ui-border-base bg-ui-bg-base shadow-elevation-flyout"
      >
        <div className="flex shrink-0 items-start justify-between border-b border-ui-border-base bg-ui-bg-base px-4 py-3 sm:px-5 sm:py-4">
          <div>
            <h2 id={titleId} className="text-section-title text-ui-fg-base font-semibold">
              {title}
            </h2>
            {description && (
              <p className="mt-1 text-xs text-ui-fg-muted">{description}</p>
            )}
          </div>
          <button
            type="button"
            onClick={handleClose}
            aria-label="Close"
            className="rounded-lg p-1.5 text-ui-fg-muted hover:bg-ui-bg-base-hover hover:text-ui-fg-base"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto bg-ui-bg-base px-4 py-3 sm:px-5 sm:py-4">
          {children}
        </div>
        {footer ? (
          <div className="shrink-0 border-t border-ui-border-base bg-ui-bg-base px-4 py-3 sm:px-5 sm:py-4">
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );
}

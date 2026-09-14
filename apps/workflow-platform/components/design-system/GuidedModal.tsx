import { type ReactNode, useEffect, useId } from "react";
import { X } from "lucide-react";
import { renderPortal } from "./portal";

export type GuidedModalSize = "md" | "lg" | "xl";

const SIZE_CLASS: Record<GuidedModalSize, string> = {
  md: "max-w-lg",
  lg: "max-w-2xl",
  xl: "max-w-3xl",
};

/**
 * Centered modal for create/edit flows — zero-training pattern:
 * title + one-line subtitle + body + footer actions (primary on the right).
 */
export function GuidedModal({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  size = "lg",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
  size?: GuidedModalSize;
}) {
  const titleId = useId();
  const descId = useId();

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
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-3 sm:p-6">
      <button
        type="button"
        className="absolute inset-0 z-[200] bg-ui-bg-overlay"
        aria-label="Close"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={subtitle ? descId : undefined}
        className={[
          "relative z-[210] flex max-h-[min(100%,calc(100vh-2rem))] w-full flex-col overflow-hidden",
          "rounded-xl border border-ui-border-base bg-ui-bg-base shadow-elevation-flyout",
          SIZE_CLASS[size],
        ].join(" ")}
      >
        <div className="shrink-0 border-b border-ui-border-base px-5 py-4 sm:px-6">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 id={titleId} className="text-section-title text-ui-fg-base">
                {title}
              </h2>
              {subtitle ? (
                <p id={descId} className="mt-1 text-sm text-ui-fg-subtle">
                  {subtitle}
                </p>
              ) : null}
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="rounded-lg p-1.5 text-ui-fg-muted hover:bg-ui-bg-base-hover hover:text-ui-fg-base"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 sm:px-6">{children}</div>
        {footer ? (
          <div className="shrink-0 border-t border-ui-border-base bg-ui-bg-subtle px-5 py-4 sm:px-6">
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );
}

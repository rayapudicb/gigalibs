import { AlertCircle } from "lucide-react";

export function ErrorState({
  message,
  title = "Something went wrong",
}: {
  message: string;
  title?: string;
}) {
  return (
    <div
      className="flex items-start gap-3 rounded-ui-lg border border-danger-border bg-danger-subtle px-4 py-3"
      role="alert"
    >
      <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-danger" aria-hidden="true" />
      <div>
        <p className="text-body font-medium text-danger">{title}</p>
        <p className="mt-0.5 text-body text-danger/90">{message}</p>
      </div>
    </div>
  );
}

/** @deprecated Use ErrorState */
export const ErrorAlert = ErrorState;

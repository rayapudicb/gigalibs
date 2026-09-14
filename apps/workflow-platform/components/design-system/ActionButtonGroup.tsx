import type { ReactNode } from "react";

export function ActionButtonGroup({
  children,
  align = "right",
}: {
  children: ReactNode;
  align?: "left" | "right";
}) {
  return (
    <div
      className={[
        "flex flex-wrap items-center gap-2",
        align === "right" ? "justify-end" : "justify-start",
      ].join(" ")}
    >
      {children}
    </div>
  );
}

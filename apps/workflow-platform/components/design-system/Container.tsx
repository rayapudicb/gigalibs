import type { ReactNode } from "react";

export interface ContainerProps {
  children: ReactNode;
  className?: string;
  padding?: "none" | "sm" | "md" | "lg";
}

const paddingClasses = {
  none: "",
  sm: "p-4",
  md: "p-5",
  lg: "p-6",
};

export function Container({
  children,
  className = "",
  padding = "none",
}: ContainerProps) {
  return (
    <div
      className={[
        "w-full rounded-lg border border-ui-border-base bg-ui-bg-base shadow-elevation-card-rest",
        paddingClasses[padding],
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {children}
    </div>
  );
}

/** @deprecated Use Container */
export const Card = Container;

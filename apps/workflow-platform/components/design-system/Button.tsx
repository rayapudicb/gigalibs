import { type ReactNode, type ButtonHTMLAttributes } from "react";
import { UiButton } from "./ui-primitives";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  icon?: ReactNode;
}

const variantMap: Record<ButtonVariant, "primary" | "secondary" | "transparent" | "danger"> = {
  primary: "primary",
  secondary: "secondary",
  ghost: "transparent",
  danger: "danger",
};

const sizeMap: Record<ButtonSize, "small" | "base" | "large"> = {
  sm: "small",
  md: "base",
  lg: "large",
};

export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  disabled,
  icon,
  children,
  className = "",
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <UiButton
      type={type}
      variant={variantMap[variant]}
      size={sizeMap[size]}
      isLoading={loading}
      disabled={disabled || loading}
      className={className}
      {...props}
    >
      {icon ? (
        <span className="inline-flex h-4 w-4 flex-shrink-0 items-center justify-center [&>svg]:h-4 [&>svg]:w-4">
          {icon}
        </span>
      ) : null}
      {children}
    </UiButton>
  );
}

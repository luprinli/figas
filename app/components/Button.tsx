import { Link } from "@remix-run/react";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import React from "react";

import LoadingSpinner from "./icons/LoadingSpinner";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  className?: string;
  variant?: "contained" | "outlined";
  color?: "primary" | "danger" | "success" | "warning";
  size?: "sm" | "md" | "lg";
  type?: "submit" | "reset" | "button";
  loading?: boolean;
  to?: string;
  target?: string;
  disabled?: boolean;
  children?: ReactNode;
}

const baseStyles =
  "group inline-flex items-center justify-center gap-1 transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-slate-900";

const sizeStyles: Record<string, string> = {
  sm: "py-1.5 px-3 text-xs rounded-md",
  md: "py-2 px-4 text-sm font-medium rounded-lg",
  lg: "py-2.5 px-6 text-sm font-semibold rounded-lg",
};

const colorPalette = {
  primary: {
    contained: "bg-primary text-white hover:bg-primary-hover",
    outlined: "bg-transparent text-primary dark:text-primary-light ring-1 ring-primary/30 dark:ring-primary/50 hover:bg-primary/5 dark:hover:bg-primary/10",
  },
  danger: {
    contained: "bg-danger text-white hover:bg-danger-hover",
    outlined: "bg-transparent text-danger dark:text-danger-light ring-1 ring-danger/30 dark:ring-danger/50 hover:bg-danger/5 dark:hover:bg-danger/10",
  },
  success: {
    contained: "bg-success text-white hover:bg-success-hover",
    outlined: "bg-transparent text-success dark:text-success-light ring-1 ring-success/30 dark:ring-success/50 hover:bg-success/5 dark:hover:bg-success/10",
  },
  warning: {
    contained: "bg-warning text-white hover:bg-warning-hover",
    outlined: "bg-transparent text-warning dark:text-warning-light ring-1 ring-warning/30 dark:ring-warning/50 hover:bg-warning/5 dark:hover:bg-warning/10",
  },
};

function resolveVariantStyles(variant: "contained" | "outlined", color?: string) {
  if (color && color in colorPalette) {
    return colorPalette[color as keyof typeof colorPalette][variant];
  }
  return colorPalette.primary[variant];
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = "contained",
    color,
    size = "md",
    children,
    className,
    loading = false,
    disabled = false,
    target,
    to,
    onClick,
    ...rest
  },
  ref
) {
  const resolvedVariant = resolveVariantStyles(variant, color);
  const resolvedSize = sizeStyles[size];
  return (
    <>
      {to ? (
        <Link
          to={to}
          className={[baseStyles, resolvedSize, resolvedVariant, className]
            .filter(Boolean)
            .join(" ")}
          target={target}
          onClick={onClick as unknown as React.MouseEventHandler<HTMLAnchorElement>}
        >
          {children}
        </Link>
      ) : (
        <button
          ref={ref}
          disabled={disabled}
          onClick={onClick}
          className={[
            baseStyles,
            resolvedSize,
            disabled || loading
              ? "opacity-50 pointer-events-none"
              : resolvedVariant,
            "cursor-pointer relative",
            className,
          ]
            .filter(Boolean)
            .join(" ")}
          {...rest}
        >
          {loading && (
            <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
              <LoadingSpinner />
            </span>
          )}
          <span className={loading ? "invisible" : undefined}>{children}</span>
        </button>
      )}
    </>
  );
});

export default Button;

import { Link } from "@remix-run/react";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import React from "react";

import LoadingSpinner from "./icons/LoadingSpinner";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  className?: string;
  variant?: "contained" | "outlined";
  color?: "primary" | "danger" | "success" | "warning";
  type?: "submit" | "reset" | "button";
  loading?: boolean;
  to?: string;
  target?: string;
  disabled?: boolean;
  onClick?: VoidFunction;
  children?: ReactNode;
}

const baseStyles =
  "group inline-flex items-center justify-center gap-1 py-3 px-6 text-sm/5 tracking-wide rounded-md transition focus:outline-none";

const colorPalette = {
  primary: {
    contained: "bg-blue-600 text-white hover:bg-blue-700",
    outlined: "bg-transparent text-blue-600 dark:text-blue-400 ring-1 ring-blue-300 dark:ring-blue-700 hover:bg-blue-50 dark:bg-blue-900/30 dark:hover:bg-blue-900/30",
  },
  danger: {
    contained: "bg-red-600 text-white hover:bg-red-700",
    outlined: "bg-transparent text-red-600 dark:text-red-400 ring-1 ring-red-300 dark:ring-red-700 hover:bg-red-50 dark:bg-red-900/30 dark:hover:bg-red-900/30",
  },
  success: {
    contained: "bg-emerald-600 text-white hover:bg-emerald-700",
    outlined: "bg-transparent text-emerald-600 dark:text-emerald-400 ring-1 ring-emerald-300 dark:ring-emerald-700 hover:bg-emerald-50 dark:bg-emerald-900/30 dark:hover:bg-emerald-900/30",
  },
  warning: {
    contained: "bg-amber-600 text-white hover:bg-amber-700",
    outlined: "bg-transparent text-amber-600 dark:text-amber-400 ring-1 ring-amber-300 dark:ring-amber-700 hover:bg-amber-50 dark:bg-amber-900/30 dark:hover:bg-amber-900/30",
  },
};

const variantStyles = {
  contained: "bg-cyan-500 text-white hover:bg-cyan-500/90",
  outlined: "bg-transparent text-cyan-600 dark:text-cyan-400 ring ring-cyan-300 dark:ring-cyan-700 hover:bg-cyan-50 dark:hover:bg-cyan-900/30",
};

function resolveVariantStyles(variant: "contained" | "outlined", color?: string) {
  if (color && color in colorPalette) {
    return colorPalette[color as keyof typeof colorPalette][variant];
  }
  return variantStyles[variant];
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = "contained",
    color,
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
  return (
    <>
      {to ? (
        <Link
          to={to}
          className={[baseStyles, resolvedVariant, className]
            .filter(Boolean)
            .join(" ")}
          target={target}
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
            disabled || loading
              ? "opacity-50 bg-slate-500 text-white dark:bg-slate-600 dark:text-slate-400 hover:bg-slate-500 hover:text-white dark:hover:bg-slate-600 dark:hover:text-slate-400 dark:text-slate-500"
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

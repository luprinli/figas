import type { InputHTMLAttributes, ReactNode } from "react";
import React from "react";

interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  id: string;
  name: string;
  label: string;
  type?: string;
  ariaLabel?: string;
  placeholder?: string;
  className?: string;
  required?: boolean;
  error?: string;
  hint?: string;
  icon?: ReactNode;
}

const TextField = React.forwardRef<HTMLInputElement, TextFieldProps>(
  function TextField(
    {
      id,
      name,
      type = "text",
      required = false,
      placeholder,
      className,
      label,
      error,
      hint,
      icon,
      ...rest
    },
    ref
  ) {
    const errorId = error ? `${id}-error` : undefined;
    const hintId = hint ? `${id}-hint` : undefined;
    const describedBy = [errorId, hintId].filter(Boolean).join(" ") || undefined;

    return (
      <div>
        {label && (
          <label
            htmlFor={id}
            className="block mb-2 text-sm tracking-wide text-slate-700 dark:text-slate-200"
          >
            {label}{" "}
            {required && (
              <span title="This field is required" aria-label="required" className="text-cyan-600">*</span>
            )}
          </label>
        )}
        <div className="relative">
          {icon && (
            <div className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">{icon}</div>
          )}
          <input
            ref={ref}
            id={id}
            name={name}
            type={type}
            required={required}
            placeholder={placeholder}
            aria-invalid={error ? true : undefined}
            aria-describedby={describedBy}
            className={[
              "block w-full rounded-md border p-3 text-sm text-slate-700 dark:text-slate-200 dark:bg-slate-700 dark:border-slate-600 transition placeholder:font-light focus:border-cyan-300 focus:ring-2 focus:ring-cyan-100 focus:outline-none",
              error ? "border-red-500 focus:border-red-500 focus:ring-red-100" : "border-slate-200 dark:border-slate-700",
              icon ? "pl-10" : "",
              className,
            ]
              .filter(Boolean)
              .join(" ")}
            {...rest}
          />
        </div>
        {error && (
          <p id={errorId} className="mt-1 text-xs text-red-600" role="alert">{error}</p>
        )}
        {hint && !error && (
          <p id={hintId} className="mt-1 text-xs text-slate-500 dark:text-slate-400">{hint}</p>
        )}
      </div>
    );
  }
);

export default TextField;

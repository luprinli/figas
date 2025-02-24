import type { InputHTMLAttributes } from "react";
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
  error?: string | null | undefined;
}

const TextField = React.forwardRef<HTMLInputElement, TextFieldProps>(
  (
    {
      id,
      name,
      type = "text",
      required = false,
      placeholder,
      className,
      label,
      error,
      ...rest
    },
    ref
  ) => {
    return (
      <div>
        {label && (
          <label
            htmlFor={id}
            className="block mb-2 text-sm tracking-wide text-slate-700"
          >
            {label}{" "}
            {required && (
              <span
                title="This field is required"
                aria-label="required"
                className="text-cyan-600"
              >
                *
              </span>
            )}
          </label>
        )}
        <input
          ref={ref}
          id={id}
          name={name}
          type={type}
          required={required}
          placeholder={placeholder}
          className={[
            "block w-full rounded-md border p-3 text-sm text-slate-700 transition placeholder:font-light",
            error
              ? "border-rose-300 focus:border-rose-300 focus:ring-2 focus:ring-rose-100 focus:outline-none"
              : "border-slate-200 focus:border-cyan-300 focus:ring-2 focus:ring-cyan-100 focus:outline-none",
            className,
          ]
            .filter(Boolean)
            .join(" ")}
          {...rest}
        />
        {error ? (
          <span className="text-xs text-rose-700" id={id}>
            {error}
          </span>
        ) : null}
      </div>
    );
  }
);

export default TextField;

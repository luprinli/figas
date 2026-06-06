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
      ...rest
    },
    ref
  ) {
    return (
      <div>
        {label && (
          <label
            htmlFor={id}
            className="block mb-2 text-sm tracking-wide text-slate-700 dark:text-slate-200 dark:text-slate-300 dark:text-slate-500"
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
            "block w-full rounded-md border p-3 text-sm text-slate-700 dark:text-slate-200 dark:bg-slate-700 dark:border-slate-600 transition placeholder:font-light border-slate-200 dark:border-slate-700 focus:border-cyan-300 focus:ring-2 focus:ring-cyan-100 focus:outline-none",
            className,
          ]
            .filter(Boolean)
            .join(" ")}
          {...rest}
        />
      </div>
    );
  }
);

export default TextField;

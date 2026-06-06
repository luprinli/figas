import type { ReactNode } from "react";

import Skeleton from "./Skeleton";

export interface PaymentMethod {
  id: string;
  code: string;
  name: string;
  description: string;
}

export interface PaymentMethodSelectorProps {
  methods: PaymentMethod[];
  selectedMethod: string;
  onSelect: (code: string) => void;
  loading?: boolean;
}

function CreditCardIcon() {
  return (
    <svg
      className="h-6 w-6"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="1" y="4" width="22" height="16" rx="2" ry="2" />
      <line x1="1" y1="10" x2="23" y2="10" />
    </svg>
  );
}

function CashIcon() {
  return (
    <svg
      className="h-6 w-6"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="2" y="6" width="20" height="12" rx="2" />
      <circle cx="12" cy="12" r="3" />
      <line x1="2" y1="10" x2="6" y2="10" />
      <line x1="18" y1="14" x2="22" y2="14" />
    </svg>
  );
}

function DocumentIcon() {
  return (
    <svg
      className="h-6 w-6"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
      <polyline points="10 9 9 9 8 9" />
    </svg>
  );
}

function BankIcon() {
  return (
    <svg
      className="h-6 w-6"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polygon points="12 2 2 7 22 7 12 2" />
      <polyline points="2 7 2 12 22 12 22 7" />
      <line x1="6" y1="12" x2="6" y2="16" />
      <line x1="10" y1="12" x2="10" y2="16" />
      <line x1="14" y1="12" x2="14" y2="16" />
      <line x1="18" y1="12" x2="18" y2="16" />
      <rect x="2" y="16" width="20" height="3" />
    </svg>
  );
}

function getMethodIcon(code: string): ReactNode {
  switch (code.toLowerCase()) {
    case "stripe":
      return <CreditCardIcon />;
    case "pay_on_departure":
    case "pay_on_arrival":
      return <CashIcon />;
    case "invoice":
      return <DocumentIcon />;
    case "bank_transfer":
      return <BankIcon />;
    default:
      return <CreditCardIcon />;
  }
}

export default function PaymentMethodSelector({
  methods,
  selectedMethod,
  onSelect,
  loading = false,
}: PaymentMethodSelectorProps) {
  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="flex items-center gap-4 rounded-lg border border-slate-200 dark:border-slate-700 p-4"
          >
            <Skeleton variant="circular" width={24} height={24} />
            <div className="flex-1 space-y-1.5">
              <Skeleton width="40%" height={16} />
              <Skeleton width="70%" height={14} />
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {methods.map((method) => {
        const isSelected = selectedMethod === method.code;

        return (
          <button
            key={method.id}
            type="button"
            onClick={() => onSelect(method.code)}
            className={[
              "flex w-full items-center gap-4 rounded-lg border p-4 text-left transition",
              isSelected
                ? "border-blue-500 ring-2 ring-blue-500 bg-blue-50"
                : "border-slate-200 bg-white dark:bg-slate-800 hover:border-slate-300 hover:bg-slate-50 dark:bg-slate-700",
            ]
              .filter(Boolean)
              .join(" ")}
          >
            <div
              className={[
                "flex h-10 w-10 shrink-0 items-center justify-center rounded-full",
                isSelected
                  ? "bg-blue-100 text-blue-600"
                  : "bg-slate-100 text-slate-500 dark:text-slate-400 dark:text-slate-500",
              ]
                .filter(Boolean)
                .join(" ")}
            >
              {getMethodIcon(method.code)}
            </div>

            <div className="flex-1 min-w-0">
              <p
                className={[
                  "text-sm/5 font-medium",
                  isSelected ? "text-blue-900" : "text-slate-900 dark:text-slate-100",
                ].join(" ")}
              >
                {method.name}
              </p>
              <p
                className={[
                  "mt-0.5 text-sm/5",
                  isSelected ? "text-blue-700" : "text-slate-500 dark:text-slate-400 dark:text-slate-500",
                ].join(" ")}
              >
                {method.description}
              </p>
            </div>

            <div
              className={[
                "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition",
                isSelected
                  ? "border-blue-500 bg-blue-500"
                  : "border-slate-300 dark:border-slate-600",
              ]
                .filter(Boolean)
                .join(" ")}
            >
              {isSelected && (
                <svg
                  className="h-3 w-3 text-white"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                >
                  <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
                </svg>
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
}

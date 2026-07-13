import { useEffect, useRef, type ReactNode } from "react";

import Button from "./Button";

export interface ConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message?: string;
  children?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "danger" | "default";
}

export default function ConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  children,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  variant = "default",
}: ConfirmDialogProps) {
  const confirmButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (isOpen) {
      confirmButtonRef.current?.focus();
    }
  }, [isOpen]);

  useEffect(() => {
    function handleEscape(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }

    if (isOpen) {
      document.addEventListener("keydown", handleEscape);
      return () => document.removeEventListener("keydown", handleEscape);
    }
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
        role="presentation"
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") onClose();
        }}
      />

      {/* Dialog */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        className="relative w-full max-w-md rounded-lg bg-white dark:bg-slate-800 p-6 shadow-xl dark:shadow-slate-900/50 ring-1 ring-slate-200 dark:ring-slate-700">
        <h3 id="confirm-dialog-title" className="text-lg/6 font-semibold text-slate-900 dark:text-slate-100">{title}</h3>
        {children ? (
          <div className="mt-2">{children}</div>
        ) : (
          message && <p className="mt-2 text-sm/5 text-slate-600 dark:text-slate-300 dark:text-slate-500">{message}</p>
        )}

        <div className="mt-6 flex items-center justify-end gap-3">
          <Button variant="outlined" onClick={onClose}>
            {cancelLabel}
          </Button>
          <Button
            ref={confirmButtonRef}
            color={variant === "danger" ? "danger" : "primary"}
            onClick={() => {
              onConfirm();
              onClose();
            }}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}

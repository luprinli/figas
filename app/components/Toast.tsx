import { useToastState } from "../utils/toast";
import type { Toast } from "../utils/toast";

/**
 * A single toast notification item.
 */
function ToastItem({
  toast,
  onDismiss,
  isLeaving,
}: {
  toast: Toast;
  onDismiss: (id: string) => void;
  isLeaving: boolean;
}) {
  const bgColor =
    toast.type === "success"
      ? "bg-green-600"
      : toast.type === "error"
        ? "bg-red-600"
        : "bg-blue-600";

  return (
    <div
      className={`${bgColor} text-white px-4 py-3 rounded-lg shadow-lg dark:shadow-slate-900/50 flex items-center justify-between gap-3 min-w-[280px] max-w-sm transition-all duration-300 ${
        isLeaving ? "opacity-0 translate-x-4 scale-95" : "opacity-100 translate-x-0 scale-100"
      }`}
      role="alert"
    >
      <span className="text-sm font-medium">{toast.message}</span>
      <button
        onClick={() => onDismiss(toast.id)}
        className="text-white/80 hover:text-white text-lg leading-none font-bold shrink-0"
        aria-label="Dismiss"
      >
        &times;
      </button>
    </div>
  );
}

/**
 * ToastContainer renders active toast notifications.
 * It should be placed once in the root layout (e.g., in root.tsx).
 */
export default function ToastContainer() {
  const { toasts, removeToast, leavingIds } = useToastState();

  if (toasts.length === 0) return null;

  return (
    <div className="fixed top-4 right-4 z-50 flex flex-col gap-2">
      {toasts.map((toast) => (
        <ToastItem
          key={toast.id}
          toast={toast}
          onDismiss={removeToast}
          isLeaving={leavingIds.has(toast.id)}
        />
      ))}
    </div>
  );
}

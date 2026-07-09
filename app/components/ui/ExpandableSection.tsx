import { useState, useRef, useEffect, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";

interface ExpandableSectionProps {
  title: string;
  defaultExpanded?: boolean;
  children: ReactNode;
  className?: string;
  badge?: string | number;
  icon?: ReactNode;
  actions?: ReactNode;
}

function ExpandableSection({
  title,
  defaultExpanded = false,
  children,
  className = "",
  badge,
  icon,
  actions,
}: ExpandableSectionProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const contentRef = useRef<HTMLDivElement>(null);
  const contentId = `expandable-content-${title.replace(/\s+/g, "-").toLowerCase()}`;

  const toggle = () => setExpanded((prev) => !prev);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      toggle();
    }
  };

  useEffect(() => {
    const el = contentRef.current;
    if (el) {
      el.style.maxHeight = expanded ? `${el.scrollHeight}px` : "0";
    }
  }, [expanded]);

  return (
    <div className={`border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden ${className}`}>
      {/* Header */}
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls={contentId}
        onClick={toggle}
        onKeyDown={handleKeyDown}
        className="flex w-full items-center justify-between gap-2 bg-slate-50 dark:bg-slate-700 px-4 py-3 text-left text-sm font-medium text-slate-900 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-700 dark:hover:bg-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 transition-colors"
      >
        <span className="flex items-center gap-2">
          {icon && <span className="shrink-0">{icon}</span>}
          <span>{title}</span>
          {badge !== undefined && (
            <span className="inline-flex items-center justify-center rounded-full bg-blue-100 px-2 py-0.5 text-xs font-semibold text-blue-700">
              {badge}
            </span>
          )}
        </span>

        <span className="flex items-center gap-2">
          {actions && <span className="ml-auto">{actions}</span>}

          {/* Chevron icon */}
          <ChevronDown
            size={16}
            className={`shrink-0 text-slate-500 dark:text-slate-400 transition-transform duration-200 ${
              expanded ? "rotate-180" : ""
            }`}
            aria-hidden="true"
          />
        </span>
      </button>

      {/* Body with max-height transition */}
      <div
        ref={contentRef}
        id={contentId}
        role="region"
        className="transition-all duration-300 ease-in-out overflow-hidden"
        style={{ maxHeight: "0" }}
      >
        <div className="px-4 py-3 border-t border-slate-200 dark:border-slate-700">{children}</div>
      </div>
    </div>
  );
}

export default ExpandableSection;

import { Link } from "@remix-run/react";

export interface PaginationProps {
  currentPage: number;
  totalPages: number;
  baseUrl: string;
  className?: string;
}

function getPageNumbers(currentPage: number, totalPages: number): (number | "ellipsis")[] {
  const pages: (number | "ellipsis")[] = [];

  if (totalPages <= 7) {
    for (let i = 1; i <= totalPages; i++) {
      pages.push(i);
    }
    return pages;
  }

  // Always show first page
  pages.push(1);

  if (currentPage > 3) {
    pages.push("ellipsis");
  }

  // Pages around current
  const start = Math.max(2, currentPage - 1);
  const end = Math.min(totalPages - 1, currentPage + 1);

  for (let i = start; i <= end; i++) {
    pages.push(i);
  }

  if (currentPage < totalPages - 2) {
    pages.push("ellipsis");
  }

  // Always show last page
  pages.push(totalPages);

  return pages;
}

export default function Pagination({
  currentPage,
  totalPages,
  baseUrl,
  className,
}: PaginationProps) {
  if (totalPages <= 1) return null;

  const pageNumbers = getPageNumbers(currentPage, totalPages);

  const linkClasses = (page: number, isActive: boolean) =>
    [
      "relative inline-flex items-center px-3 py-2 text-sm/5 font-medium transition-colors duration-150",
      isActive
        ? "z-10 bg-cyan-500 text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 focus-visible:ring-offset-1"
        : "text-slate-700 dark:text-slate-300 ring-1 ring-inset ring-slate-200 dark:ring-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/50 dark:hover:bg-slate-700/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 focus-visible:ring-offset-1",
    ]
      .filter(Boolean)
      .join(" ");

  return (
    <nav
      className={["flex items-center justify-center gap-1", className]
        .filter(Boolean)
        .join(" ")}
      aria-label="Pagination"
    >
      {/* Previous button */}
      {currentPage > 1 ? (
        <Link
          to={`${baseUrl}?page=${currentPage - 1}`}
          className="relative inline-flex items-center rounded-l-md px-3 py-2 text-sm/5 font-medium text-slate-700 dark:text-slate-200 dark:text-slate-300 ring-1 ring-inset ring-slate-200 dark:ring-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/50 dark:hover:bg-slate-700/50 transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 focus-visible:ring-offset-1"
        >
          Previous
        </Link>
      ) : (
        <span className="relative inline-flex items-center rounded-l-md px-3 py-2 text-sm/5 font-medium text-slate-500 dark:text-slate-500 ring-1 ring-inset ring-slate-200 dark:ring-slate-700 cursor-not-allowed">
          Previous
        </span>
      )}

      {/* Page numbers */}
      <div className="hidden sm:flex gap-1">
        {pageNumbers.map((page, index) =>
          page === "ellipsis" ? (
            <span
              key={`ellipsis-${index}`}
              className="relative inline-flex items-center px-3 py-2 text-sm/5 font-medium text-slate-500 dark:text-slate-500"
            >
              ...
            </span>
          ) : (
            <Link
              key={page}
              to={`${baseUrl}?page=${page}`}
              className={linkClasses(page, page === currentPage)}
              aria-current={page === currentPage ? "page" : undefined}
            >
              {page}
            </Link>
          )
        )}
      </div>

      {/* Mobile: simple page indicator */}
      <span className="sm:hidden text-sm/5 font-medium text-slate-700 dark:text-slate-200 px-2">
        Page {currentPage} of {totalPages}
      </span>

      {/* Next button */}
      {currentPage < totalPages ? (
        <Link
          to={`${baseUrl}?page=${currentPage + 1}`}
          className="relative inline-flex items-center rounded-r-md px-3 py-2 text-sm/5 font-medium text-slate-700 dark:text-slate-200 ring-1 ring-inset ring-slate-200 dark:ring-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 focus-visible:ring-offset-1"
        >
          Next
        </Link>
      ) : (
        <span className="relative inline-flex items-center rounded-r-md px-3 py-2 text-sm/5 font-medium text-slate-500 dark:text-slate-400 ring-1 ring-inset ring-slate-200 dark:ring-slate-700 cursor-not-allowed">
          Next
        </span>
      )}
    </nav>
  );
}

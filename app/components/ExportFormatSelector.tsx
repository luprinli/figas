import Button from "./Button";
import DateRangePicker from "./DateRangePicker";

export interface ExportTypeOption {
  value: string;
  label: string;
}

export interface ExportFormatOption {
  value: string;
  label: string;
}

export interface ExportFormatSelectorProps {
  exportTypes: ExportTypeOption[];
  exportFormats: ExportFormatOption[];
  selectedType: string;
  selectedFormat: string;
  dateFrom?: string;
  dateTo?: string;
  onTypeChange: (type: string) => void;
  onFormatChange: (format: string) => void;
  onDateChange?: (range: { dateFrom: string; dateTo: string }) => void;
  onExport: () => void;
  loading?: boolean;
}

export default function ExportFormatSelector({
  exportTypes,
  exportFormats,
  selectedType,
  selectedFormat,
  dateFrom,
  dateTo,
  onTypeChange,
  onFormatChange,
  onDateChange,
  onExport,
  loading = false,
}: ExportFormatSelectorProps) {
  return (
    <div className="rounded-lg bg-white dark:bg-slate-800 shadow-sm dark:shadow-slate-900/20 ring-1 ring-slate-200 dark:ring-slate-700 p-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Export Type */}
        <div>
          <label
            htmlFor="export-type"
            className="block text-sm/5 font-medium text-slate-700 dark:text-slate-200 mb-1.5"
          >
            Export Type
          </label>
          <select
            id="export-type"
            value={selectedType}
            onChange={(e) => onTypeChange(e.target.value)}
            className="block w-full rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm/5 text-slate-900 dark:text-slate-100 shadow-sm dark:shadow-slate-900/20 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            {exportTypes.map((type) => (
              <option key={type.value} value={type.value}>
                {type.label}
              </option>
            ))}
          </select>
        </div>

        {/* Export Format */}
        <div>
          <label
            htmlFor="export-format"
            className="block text-sm/5 font-medium text-slate-700 dark:text-slate-200 mb-1.5"
          >
            Export Format
          </label>
          <select
            id="export-format"
            value={selectedFormat}
            onChange={(e) => onFormatChange(e.target.value)}
            className="block w-full rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm/5 text-slate-900 dark:text-slate-100 shadow-sm dark:shadow-slate-900/20 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            {exportFormats.map((format) => (
              <option key={format.value} value={format.value}>
                {format.label}
              </option>
            ))}
          </select>
        </div>

        {/* Date Range */}
        {onDateChange && (
          <div>
            <span className="block text-sm/5 font-medium text-slate-700 dark:text-slate-200 mb-1.5">
              Date Range
            </span>
            <DateRangePicker
              dateFrom={dateFrom ?? ""}
              dateTo={dateTo ?? ""}
              onDateChange={onDateChange}
            />
          </div>
        )}
      </div>

      {/* Export Button */}
      <div className="mt-4 flex justify-end">
        <Button onClick={onExport} loading={loading}>
          {loading ? "Exporting..." : "Export"}
        </Button>
      </div>
    </div>
  );
}

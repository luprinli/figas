/**
 * Reusable print utility for FIGAS.
 * Generates print-optimized HTML and opens it in a new window for dedicated printing.
 * Unlike window.print(), this avoids printing the entire application UI.
 */

export interface PrintOptions {
  title: string;
  header: string;
  subheader?: string;
  sections: PrintSection[];
  footer?: string;
  theme?: "light" | "dark";
}

export interface PrintSection {
  heading?: string;
  rows: PrintRow[];
}

export interface PrintRow {
  label: string;
  value: string;
  labelClass?: string;
  valueClass?: string;
}

export function buildPrintHtml(options: PrintOptions): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${options.title}</title>
  <style>
    @page { size: A4; margin: 12mm; }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: "Inter", system-ui, sans-serif;
      font-size: 9pt;
      color: ${options.theme === "dark" ? "#e2e8f0" : "#1e293b"};
      background: ${options.theme === "dark" ? "#0f172a" : "#ffffff"};
    }
    .header {
      border-bottom: 2px solid #2563eb;
      padding-bottom: 4mm;
      margin-bottom: 6mm;
    }
    .header h1 { font-size: 14pt; font-weight: 700; }
    .header p { font-size: 8pt; color: #64748b; margin-top: 1mm; }
    .section { margin-bottom: 5mm; }
    .section h2 {
      font-size: 9pt; font-weight: 700; color: #2563eb;
      border-bottom: 1px solid #e2e8f0; padding-bottom: 2mm; margin-bottom: 3mm;
    }
    .row { display: flex; justify-content: space-between; padding: 1.5mm 0; border-bottom: 1px solid #f1f5f9; font-size: 8pt; }
    .row .label { color: #64748b; }
    .row .value { font-weight: 600; text-align: right; }
    .footer {
      margin-top: 10mm; padding-top: 4mm; border-top: 1px solid #e2e8f0;
      font-size: 7pt; color: #94a3b8; text-align: center;
    }
    .barcode { font-family: "Courier New", monospace; font-size: 10pt; letter-spacing: 2px; }
    @media print {
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>${options.header}</h1>
    ${options.subheader ? `<p>${options.subheader}</p>` : ""}
  </div>
  ${options.sections.map(s => `
    <div class="section">
      ${s.heading ? `<h2>${s.heading}</h2>` : ""}
      ${s.rows.map(r => `
        <div class="row">
          <span class="label ${r.labelClass || ""}">${r.label}</span>
          <span class="value ${r.valueClass || ""}">${r.value}</span>
        </div>
      `).join("")}
    </div>
  `).join("")}
  <div class="footer">
    ${options.footer || "FIGAS Flight Operations — Uncontrolled when printed"}
  </div>
  <script>window.onload = () => { window.print(); setTimeout(() => window.close(), 500); }</script>
</body>
</html>`;
}

export function printDocument(options: PrintOptions): void {
  if (typeof window === "undefined") return;
  const html = buildPrintHtml(options);
  const win = window.open("", "_blank", "width=600,height=600");
  if (!win) return;
  win.document.write(html);
  win.document.close();
}

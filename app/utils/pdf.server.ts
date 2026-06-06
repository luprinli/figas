import type { ReactNode } from "react";

interface PdfGeneratorOptions {
  title: string;
  author: string;
  subject: string;
}

export interface PdfDocument {
  id: string;
  content: string;
  options: PdfGeneratorOptions;
}

const loadsheetTemplate = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>{{title}}</title>
  <style>
    @page { size: A4 landscape; margin: 12mm; }
    body { font-family: "Inter", Helvetica, Arial, sans-serif; font-size: 9pt; color: #1e293b; }
    .header { display: flex; justify-content: space-between; border-bottom: 2px solid #2563eb; padding-bottom: 8mm; margin-bottom: 6mm; }
    .header-left { font-weight: bold; font-size: 12pt; }
    .header-right { text-align: right; font-size: 7pt; color: #64748b; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 4mm; }
    th { text-align: left; padding: 2mm 3mm; background: #f1f5f9; font-size: 7pt; font-weight: 600; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 1px solid #e2e8f0; }
    td { padding: 2mm 3mm; border-bottom: 1px solid #f1f5f9; font-size: 8pt; }
    .section-title { font-size: 9pt; font-weight: 700; margin: 6mm 0 3mm 0; color: #2563eb; border-bottom: 1px solid #e2e8f0; padding-bottom: 2mm; }
    .footer { margin-top: 10mm; padding-top: 4mm; border-top: 1px solid #e2e8f0; font-size: 7pt; color: #94a3b8; text-align: center; }
    .weight-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 2mm; }
    .weight-item { display: flex; justify-content: space-between; padding: 1.5mm 3mm; background: #f8fafc; border-radius: 2mm; }
    .total-row { font-weight: 700; border-top: 2px solid #1e293b; }
  </style>
</head>
<body>
  <div class="header">
    <div class="header-left">FIGAS<br>Flight Operations</div>
    <div class="header-right">
      <div>Falkland Islands Government Air Service</div>
      <div>{{contactEmail}} · {{contactPhone}}</div>
    </div>
  </div>
  {{content}}
  <div class="footer">
    This document is uncontrolled when printed. Generated {{timestamp}}.
  </div>
</body>
</html>
`;

const briefingTemplate = loadsheetTemplate;

export function generatePdfHtml(
  content: ReactNode,
  options: PdfGeneratorOptions
): string {
  const timestamp = new Date().toISOString();
  const contactEmail = process.env.CONTACT_EMAIL || "ops@figas.gov.fk";
  const contactPhone = process.env.CONTACT_PHONE || "+500 27219";

  return loadsheetTemplate
    .replace("{{title}}", options.title)
    .replace("{{timestamp}}", timestamp)
    .replace("{{contactEmail}}", contactEmail)
    .replace("{{contactPhone}}", contactPhone)
    .replace("{{content}}", "");
}

export function buildPdfDocument(
  title: string,
  contentHtml: string
): PdfDocument {
  return {
    id: `pdf-${Date.now()}`,
    content: contentHtml,
    options: {
      title,
      author: "FIGAS Flight Operations",
      subject: title,
    },
  };
}

export function generateLoadsheetPdf(flightNumber: string, date: string, tableRows: string): string {
  const html = generatePdfHtml(null, {
    title: `${flightNumber} Loadsheet`,
    author: "FIGAS Flight Operations",
    subject: `Loadsheet for ${flightNumber} on ${date}`,
  });

  return html.replace("{{content}}", `
    <h1 style="font-size:14pt;margin-bottom:4mm">${flightNumber} — Loadsheet</h1>
    <p style="font-size:9pt;color:#64748b;margin-bottom:6mm">${date}</p>
    <div class="section-title">Sector Calculations</div>
    <table>${tableRows}</table>
  `);
}

export function generateBriefingPdf(flightNumber: string, date: string, content: string): string {
  const html = generatePdfHtml(null, {
    title: `Pilot Briefing — ${flightNumber}`,
    author: "FIGAS Flight Operations",
    subject: `Pilot Briefing for ${flightNumber}`,
  });

  return html.replace("{{content}}", content);
}

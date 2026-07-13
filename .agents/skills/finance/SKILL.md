---
name: finance
description: >-
  Finance domain skill for the FIGAS financial management system. Covers invoice
  generation from bookings, payment allocation (Stripe + manual), bank reconciliation,
  CSV/XML export, daily sales reports, tax reports, aging receivables, and payment
  reminders. Preserves invariants for double-entry accounting, segregation of duties,
  and the invoice lifecycle.
author: FIGAS Engineering
---

# Finance Domain Skill

## Overview

This skill defines the **contract** for the FIGAS finance module. The finance system
manages the full order-to-cash cycle: booking costing → invoice generation → payment
collection (Stripe, manual, counter) → bank reconciliation → financial reporting →
payment reminders.

The finance domain spans 15 route files under `/finance/*` and relies on 5 core
service modules plus the pricing engine.

PBAC permissions guarding finance: `finance:view`, `finance:create-invoice`, `finance:record-payment`,
`finance:reconcile`, `finance:manage-exports`, `finance:manage-reminders`, `finance:manage-credit`.

---

## Architecture

```
Booking Costing                 Invoice Generation
┌──────────────────┐           ┌───────────────────┐
│ pricing-engine   │──base──▶  │ invoice.service    │
│ booking-costing  │   fare    │ - generateInvoice  │
└──────────────────┘           │ - issueInvoice     │
                               │ - cancelInvoice    │
                               └───────┬───────────┘
                                       │
                          ┌────────────▼────────────┐
                          │    payment.service       │
                          │ - initiatePayment        │
                          │ - processStripeWebhook   │
                          │ - recordManualPayment    │
                          └────────────┬────────────┘
                                       │
               ┌───────────────────────┼───────────────────────┐
               │                       │                       │
    ┌──────────▼──────────┐  ┌────────▼────────┐  ┌───────────▼──────────┐
    │ reconciliation.svc  │  │  export.service  │  │  reminder.service    │
    │ - autoMatch         │  │ - exportToCsv    │  │ - scheduleReminder   │
    │ - matchTransaction  │  │ - exportToXml    │  │ - processPending     │
    │ - importBankStmt    │  │ - getRecentExports│ │ - cancelForBooking   │
    └─────────────────────┘  └─────────────────┘  └──────────────────────┘
```

---

## Key Files

| File | Role |
|------|------|
| `app/routes/finance._index.tsx` | Finance dashboard with KPI cards and quick actions |
| `app/routes/finance.invoices.tsx` | Invoice list with status filters (draft/issued/paid/overdue/cancelled) |
| `app/routes/finance.invoices.$invoiceId.tsx` | Single invoice detail view with line items and payment history |
| `app/routes/finance.payments.tsx` | Payment list with method filters (stripe/cash/invoice/deferred) |
| `app/routes/finance.reconciliation.tsx` | Bank reconciliation: unmatched transactions, auto-match, manual match |
| `app/routes/finance.exports.tsx` | Export interface: select type, date range, format (CSV/XML) |
| `app/routes/finance.reports.tsx` | Reports hub linking to sub-reports |
| `app/routes/finance.reports.daily-sales.tsx` | Daily sales report grouped by route |
| `app/routes/finance.reports.tax.tsx` | Tax report (VAT/GST breakdowns) |
| `app/routes/finance.reports.aging.tsx` | Aging receivables with 30/60/90/90+ day buckets |
| `app/routes/finance.reports.payment-summary.tsx` | Payment method summary report |
| `app/routes/finance.bookings.tsx` | Bookings view filtered for finance context |
| `app/routes/finance.flights.tsx` | Flights view filtered for finance context |
| `app/routes/finance.settings.tsx` | Finance settings (credit limits, payment terms, reminder config) |
| `app/utils/services/invoice.service.ts` | Invoice lifecycle: generate, issue, cancel, record payment against, aging summary |
| `app/utils/services/payment.service.ts` | Payment initiation (Stripe/manual), booking costing, fare calculation |
| `app/utils/services/reconciliation.service.ts` | Bank statement import, auto-match, manual match, discrepancy flagging |
| `app/utils/services/export.service.ts` | CSV/XML export engine with type-specific query builders |
| `app/utils/services/reminder.service.ts` | Payment reminder scheduling and batch processing |
| `app/utils/pricing/pricing-engine.server.ts` | Core fare lookup, discount rules, leg fare computation |
| `app/utils/pricing/booking-costing.server.ts` | Full booking cost computation: legs �— passengers �— discounts |
| `app/utils/pricing/payment-allocation.server.ts` | Payment-to-invoice allocation logic |
| `app/utils/pricing/invoice-lines.server.ts` | Invoice line item construction from booking legs |
| `app/utils/pricing/fare-import.server.ts` | Bulk fare matrix import/export |
| `app/utils/repositories/invoice.ts` | Invoice CRUD repository |
| `app/utils/repositories/invoice-item.ts` | Invoice line item repository |
| `app/utils/repositories/payment-method.ts` | Payment method configuration repository |
| `app/utils/repositories/stripe-payment.ts` | Stripe session and payment intent repository |
| `app/utils/repositories/bank-transaction.ts` | Bank transaction repository |
| `app/utils/repositories/accounting-entry.ts` | Double-entry accounting journal repository |
| `app/utils/repositories/export-log.ts` | Export history audit log |
| `app/utils/repositories/payment-reminder.ts` | Payment reminder repository |
| `app/utils/repositories/organization.ts` | Organization credit limit and billing config |
| `app/utils/repositories/fare-route.ts` | Fare route lookup (`getBaseFare`) |

---

## Data Flow

### Invoice Generation (`invoice.service.ts`)

1. Fetch booking with legs, passengers, and freight data
2. Compute cost per leg �— passenger using `pricing-engine.server` (`computeLegFare`)
3. Sum freight charges (`FREIGHT_RATE_PER_KG �— freight_weight_kg`)
4. Apply discounts from `DISCOUNT_RULES`: child (50%), student (25%), senior (25%), veteran (30%), staff (100%)
5. Create `invoices` record with `InvoiceStatus.DRAFT`
6. Create `invoice_items` records for each line item
7. Issue transitions status to `InvoiceStatus.ISSUED` and records accounting entries (debit AR, credit revenue)

### Pricing Engine (`pricing-engine.server.ts`)

```typescript
export type DiscountType = "none" | "child" | "veteran" | "senior" | "student" | "staff";

const DISCOUNT_RULES: Record<DiscountType, DiscountRule> = {
  none:    { percent: 0, label: "Standard fare" },
  child:   { percent: 50, maxAge: 12, label: "Child (under 12)" },
  student: { percent: 25, maxAge: 25, label: "Student" },
  senior:  { percent: 25, minAge: 65, label: "Senior (65+)" },
  veteran: { percent: 30, label: "Veteran" },
  staff:   { percent: 100, label: "FIGAS Staff" },
};
```

Fare lookup uses `fare_matrix` table with bidirectional fallback:
```typescript
async lookupFare(originCode, destinationCode) → fare_matrix
// If not found, try reverse direction (origin ↔ destination swap)
```

### Booking Costing (`booking-costing.server.ts`)

Computes per-passenger-per-leg cost:
```
FOR each booking_leg_passenger:
  baseFare = lookupFare(origin, destination) ?? 0
  discount = applyDiscount(passengerAge, discountType)
  discountedFare = baseFare * (1 - discount/100)
```

Returns `BookingCostResult { legs: LegCostLine[], subtotal, totalDiscount, grandTotal }`.

### Payment Initiation (`payment.service.ts`)

Four payment methods:
1. **Stripe** — Creates Stripe Checkout session; webhook processes `checkout.session.completed`
2. **Invoice** — Generates invoice with `payment_due_date = NOW() + DEFAULT_PAYMENT_TERM_DAYS`
3. **Pay-on-Departure** — Deferred payment, collected at check-in counter
4. **Pay-on-Arrival** — Deferred payment, collected on arrival

### Reconciliation (`reconciliation.service.ts`)

1. **Import bank statement** — `importBankStatement()` parses external CSV, inserts `bank_transactions`
2. **Auto-match** — Matches by amount ± tolerance and date proximity against `payments` table
3. **Manual match** — Staff links unmatched `bank_transaction` to `payment`
4. **Discrepancy flagging** — Marks transactions with amount mismatch for review

### Export (`export.service.ts`)

Supports `ExportType`: `invoices`, `payments`, `reconciliation`, `tax`, `daily_sales`, `aging`.
Supports `ExportFormat`: `csv`, `xml`.
Each export type has a dedicated query builder that fetches data within date range and serializes to the requested format.

### Payment Reminders (`reminder.service.ts`)

- `scheduleReminder()` — creates a `payment_reminders` record with `scheduled_at`
- `processPendingReminders()` — batch processes unsent reminders, sends via configured channel
- `cancelRemindersForBooking()` — cancels all pending reminders when booking is paid

---

## Validation Rules

### Invariant 1: Segregation of Duties (SoD)
Enforced in `app/utils/permissions.server.ts:532-536`:

```
finance:record-payment  ≠  finance:reconcile      (same person cannot record AND reconcile)
finance:create-invoice  ≠  finance:record-payment  (same person cannot create AND pay invoices)
user:create              ≠  user:assign-role       (same person cannot create users AND assign roles)
```

`validateSoDForRole()` checks all three SoD pairs when assigning a role.

### Invariant 2: Double-Entry Accounting
Every financial transaction creates `accounting_entries` with paired debits/credits:
- Invoice issue: Debit Accounts Receivable, Credit Revenue
- Payment receipt: Debit Cash/Bank, Credit Accounts Receivable
- Refund: Debit Revenue, Credit Cash/Bank

### Invariant 3: Invoice Lifecycle
```
DRAFT → ISSUED → (PAID | OVERDUE | CANCELLED)
```
- `DRAFT`: Editable, not sent to customer
- `ISSUED`: Immutable line items, sent to customer (triggers AR entry)
- `PAID`: Fully settled (triggers cash entry)
- `OVERDUE`: Past `payment_due_date` without full payment
- `CANCELLED`: Voided (triggers reversal entries)

### Invariant 4: Fare Consistency
The `fare_matrix` is the single source of truth for base fares. `lookupFare()` in `pricing-engine.server.ts` queries it bidirectionally. Never hardcode fares in component or route files.

### Invariant 5: Export Audit Trail
Every export is logged in `export_logs` with `user_id`, `export_type`, `format`, `date_range`, and `record_count`. This is an audit requirement — never skip the log write.

### Invariant 6: Payment Due Date
`DEFAULT_PAYMENT_TERM_DAYS` constant sets the default due date from invoice issue date. Organization-specific terms may override via `organizations.payment_terms` field.

---

## Integration Points

### Booking → Finance
Bookings provide: `total_amount_gbp`, `payment_status`, `payment_method`, `is_organization_billing`. The pricing engine computes costs; the invoice service materializes them as invoice line items.

### Check-in → Finance
Counter payments flow through `checkinRepository.recordPayment()` to the `payments` table, which the reconciliation engine matches against bank transactions.

### Stripe Webhook
`payment.service.ts` handles `checkout.session.completed` events: records payment, updates booking `payment_status = "paid"`, issues invoice (if not already issued), records accounting entry.

### Organization Billing
Organizations with `is_organization_billing = true` on bookings bypass counter payment collection and instead receive invoices with payment terms defined in `organizations.payment_terms`.

### Report Routes
- `finance.reports.daily-sales` — groups payments by date and route
- `finance.reports.tax` — VAT/GST breakdown by rate
- `finance.reports.aging` — 0-30, 31-60, 61-90, 90+ day buckets
- `finance.reports.payment-summary` — totals by payment method

---

## Do's and Don'ts

### Do

- ✅ Do use `computeBookingCost()` from `booking-costing.server.ts` as the single entry point for booking cost calculation
- ✅ Do use `lookupFare()` from `pricing-engine.server.ts` for fare lookups (never query `fare_matrix` directly)
- ✅ Do record an `accounting_entry` for every financial transaction (double-entry)
- ✅ Do log every export to `export_logs` with user, type, format, date range, and record count
- ✅ Do enforce SoD via `validateSoD()` and `validateSoDForRole()` before assigning finance roles
- ✅ Do use the `DISCOUNT_RULES` constant from `pricing-engine.server.ts` — never hardcode discount percentages
- ✅ Do generate invoice line items via `invoice-lines.server.ts` — maintains consistency with costing
- ✅ Do respect `organizations.payment_terms` when present (overrides `DEFAULT_PAYMENT_TERM_DAYS`)
- ✅ Do use `bankTransactionRepository` for all bank transaction CRUD (not direct Prisma queries)
- ✅ Do validate that `initiatorId !== approverId` via `validateApproval()` for refunds and adjustments

### Don't

- ❌ Don't allow the same user to hold both `finance:record-payment` and `finance:reconcile`
- ❌ Don't allow the same user to hold both `finance:create-invoice` and `finance:record-payment`
- ❌ Don't hardcode fare values in route or component files — use the pricing engine
- ❌ Don't change `DISCOUNT_RULES` without updating test fixtures and invoice snapshot tests
- ❌ Don't skip the export audit log — every export must write to `export_logs`
- ❌ Don't bypass the invoice lifecycle — never transition directly from DRAFT to PAID
- ❌ Don't delete invoices — use `cancelInvoice()` which records reversal accounting entries
- ❌ Don't remove the bidirectional fallback in `lookupFare()` — some routes are stored in one direction only
- ❌ Don't use `bookingRepository.updatePayment()` directly for Stripe payments — use `payment.service.ts`
- ❌ Don't export without checking `finance:manage-exports` permission

// Page size
export const DEFAULT_PAGE_SIZE = 20;

// Password
export const MIN_PASSWORD_LENGTH = 8;

// Weight limits
export const MAX_PASSENGER_WEIGHT_KG = 300;
export const MIN_PASSENGER_WEIGHT_KG = 20;
export const MAX_BAGGAGE_WEIGHT_KG = 50;

// Booking limits
export const MAX_PASSENGERS_PER_BOOKING = 9;
export const MIN_PASSENGER_AGE = 2;
export const MIN_REGISTRATION_AGE = 18;

// Rate limiting
export const AUTH_RATE_LIMIT_MAX = 5;
export const GENERAL_RATE_LIMIT_MAX = 10;
export const RATE_LIMIT_WINDOW_MS = 60_000;
export const CLEANUP_INTERVAL_MS = 300_000;

// User roles
/** @deprecated Use `Permission` constants instead. Roles are containers, not authorization primitives. */
export const UserRole = {
  ADMIN: "admin",
  PILOT: "pilot",
  ENGINEER: "engineer",
  PASSENGER: "passenger",
  OPERATIONS: "operations",
  CHECKIN: "checkin",
  FINANCE: "finance",
} as const;
/** @deprecated Use permission-based checks instead. */
export type UserRoleType = (typeof UserRole)[keyof typeof UserRole];

// Permission constants (resource:action naming convention)
export const Permission = {
  // Bookings
  BOOKING_CREATE: "booking:create",
  BOOKING_VIEW: "booking:view",
  BOOKING_EDIT: "booking:edit",
  BOOKING_CANCEL: "booking:cancel",
  BOOKING_CHECKIN: "booking:checkin",
  BOOKING_APPROVE: "booking:approve",
  BOOKING_ASSIGN_FLIGHT: "booking:assign-flight",
  BOOKING_MANAGE_PASSENGERS: "booking:manage-passengers",
  BOOKING_MANAGE_FREIGHT: "booking:manage-freight",
  BOOKING_MANAGE_PAYMENT: "booking:manage-payment",

  // Flights
  FLIGHT_CREATE: "flight:create",
  FLIGHT_VIEW: "flight:view",
  FLIGHT_EDIT: "flight:edit",
  FLIGHT_CANCEL: "flight:cancel",
  FLIGHT_MANAGE_MANIFEST: "flight:manage-manifest",
  FLIGHT_ASSIGN_PILOT: "flight:assign-pilot",
  FLIGHT_MANAGE_SEATS: "flight:manage-seats",

  // Schedules
  SCHEDULE_CREATE: "schedule:create",
  SCHEDULE_VIEW: "schedule:view",
  SCHEDULE_EDIT: "schedule:edit",
  SCHEDULE_APPROVE: "schedule:approve",
  SCHEDULE_PUBLISH: "schedule:publish",
  SCHEDULE_ASSIGN_PILOT: "schedule:assign-pilot",

  // Users
  USER_CREATE: "user:create",
  USER_VIEW: "user:view",
  USER_EDIT: "user:edit",
  USER_DELETE: "user:delete",
  USER_ASSIGN_ROLE: "user:assign-role",
  USER_RESET_PASSWORD: "user:reset-password",

  // Roles
  ROLE_CREATE: "role:create",
  ROLE_VIEW: "role:view",
  ROLE_EDIT: "role:edit",
  ROLE_DELETE: "role:delete",
  ROLE_MANAGE_PERMISSIONS: "role:manage-permissions",

  // Finance
  FINANCE_VIEW: "finance:view",
  FINANCE_CREATE_INVOICE: "finance:create-invoice",
  FINANCE_RECORD_PAYMENT: "finance:record-payment",
  FINANCE_RECONCILE: "finance:reconcile",
  FINANCE_MANAGE_EXPORTS: "finance:manage-exports",
  FINANCE_MANAGE_REMINDERS: "finance:manage-reminders",
  FINANCE_MANAGE_CREDIT: "finance:manage-credit",

  // Settings
  SETTINGS_VIEW: "settings:view",
  SETTINGS_EDIT: "settings:edit",

  // Reports
  REPORT_VIEW: "report:view",
  REPORT_EXPORT: "report:export",

  // Audit
  AUDIT_VIEW: "audit:view",
  AUDIT_EXPORT: "audit:export",

  // Check-in
  CHECKIN_VIEW: "checkin:view",
  CHECKIN_PROCESS: "checkin:process",
  CHECKIN_MANAGE_REMINDERS: "checkin:manage-reminders",

  // Maintenance
  MAINTENANCE_VIEW: "maintenance:view",
  MAINTENANCE_EDIT: "maintenance:edit",
  MAINTENANCE_MANAGE_AIRFRAME: "maintenance:manage-airframe",
  MAINTENANCE_LOG_FLIGHT: "maintenance:log-flight",
  MAINTENANCE_CREATE_TASK: "maintenance:create-task",
  MAINTENANCE_SIGN_OFF: "maintenance:sign-off",
  MAINTENANCE_DEFER_DEFECT: "maintenance:defer-defect",
  MAINTENANCE_MANAGE_COMPONENTS: "maintenance:manage-components",

  // Organizations
  ORGANIZATION_VIEW: "organization:view",
  ORGANIZATION_CREATE: "organization:create",
  ORGANIZATION_EDIT: "organization:edit",

  // No-Fly Days
  NO_FLY_MANAGE: "no-fly:manage",

  // Admin
  ADMIN_ACCESS: "admin:access",

  // Loadsheet
  LOADSHEET_VIEW: "loadsheet:view",
  LOADSHEET_EDIT: "loadsheet:edit",
} as const;
export type PermissionType = (typeof Permission)[keyof typeof Permission];

// Booking statuses
export const BookingStatus = {
  PENDING: "pending",
  PASSENGERS_ADDED: "passengers_added",
  WEIGHT_DECLARED: "weight_declared",
  FREIGHT_DECLARED: "freight_declared",
  FLIGHT_ASSIGNED: "flight_assigned",
  PILOT_REVIEW: "pilot_review",
  APPROVED: "approved",
  COMPLETED: "completed",
  CANCELLED: "cancelled",
} as const;
export type BookingStatusType = (typeof BookingStatus)[keyof typeof BookingStatus];

// Payment statuses
export const PaymentStatus = {
  PENDING: "pending",
  PROCESSING: "processing",
  PAID: "paid",
  PARTIALLY_PAID: "partially_paid",
  INVOICED: "invoiced",
  OVERDUE: "overdue",
  REFUNDED: "refunded",
  PARTIALLY_REFUNDED: "partially_refunded",
  FAILED: "failed",
  CANCELLED: "cancelled",
} as const;
export type PaymentStatusType = (typeof PaymentStatus)[keyof typeof PaymentStatus];

// Payment methods
export const PaymentMethod = {
  STRIPE: "stripe",
  PAY_ON_DEPARTURE: "pay_on_departure",
  PAY_ON_ARRIVAL: "pay_on_arrival",
  INVOICE: "invoice",
  BANK_TRANSFER: "bank_transfer",
} as const;
export type PaymentMethodType = (typeof PaymentMethod)[keyof typeof PaymentMethod];

// Flight statuses
export const FlightStatus = {
  SCHEDULED: "scheduled",
  BOARDING: "boarding",
  IN_PROGRESS: "in_progress",
  COMPLETED: "completed",
  CANCELLED: "cancelled",
} as const;
export type FlightStatusType = (typeof FlightStatus)[keyof typeof FlightStatus];

// Residency statuses
export const ResidencyStatus = {
  RESIDENT: "resident",
  TOURIST: "tourist",
} as const;
export type ResidencyStatusType = (typeof ResidencyStatus)[keyof typeof ResidencyStatus];

// Booking source
export const BookingSource = {
  CUSTOMER_DIRECT: "customer_direct",
  BOOKING_AGENT: "booking_agent",
  OPERATIONS_STAFF: "operations_staff",
} as const;
export type BookingSourceType = (typeof BookingSource)[keyof typeof BookingSource];

// Domain defaults
export const DEFAULT_CLOTHED_BODY_WEIGHT_KG = 70;
export const DEFAULT_MAX_LEGS_PER_BOOKING = 4;
export const DEFAULT_BN2_MTOW_KG = 2994;
export const DEFAULT_BN2_MAX_PAYLOAD_KG = 1160;
export const DEFAULT_BN2_EMPTY_WEIGHT_KG = 1627;

// BN-2 performance defaults
export const DEFAULT_CRUISE_SPEED_KTAS = 140;
export const DEFAULT_BN2_BURN_RATE_KG_PER_HOUR = 45;
export const DEFAULT_RESERVE_FUEL_KG = 35;
export const DEFAULT_TAXI_FUEL_KG = 3;
export const DEFAULT_TAXI_MINUTES = 10;
export const DEFAULT_TURNAROUND_MINUTES = 10;

// Pilot defaults
export const DEFAULT_PILOT_WEIGHT_KG = 80;
export const STANDARD_CREW_WEIGHT_KG = 80;
export const MINIMUM_REST_HOURS = 12;
export const MAX_DUTY_HOURS_PER_DAY = 12;
export const MAX_FLIGHT_HOURS_PER_DAY = 8;

// Fare defaults
export const DEFAULT_FARE_PER_PASSENGER = 50;
export const FREIGHT_RATE_PER_KG = 2;

// Tax defaults
export const DEFAULT_TAX_RATE = 0;
export const DEFAULT_PAYMENT_TERM_DAYS = 30;

// Accounting
export const ACCOUNT_CASH_AT_BANK = "1010";
export const ACCOUNT_ACCOUNTS_RECEIVABLE = "1020";
export const ACCOUNT_PASSENGER_FARE_REVENUE = "4010";

// Date utilities
export const EPOCH_DATE = "1970-01-01";
export const CALENDAR_LOOKAHEAD_DAYS = 90;

// Booking
export const MAX_BOOKING_REFERENCE_ATTEMPTS = 10;
export const SYSTEM_USER_ID = 0;


// Invoice statuses
export const InvoiceStatus = {
  DRAFT: "draft",
  ISSUED: "issued",
  PAID: "paid",
  OVERDUE: "overdue",
  CANCELLED: "cancelled",
  VOIDED: "voided",
  WRITTEN_OFF: "written_off",
} as const;
export type InvoiceStatusType = (typeof InvoiceStatus)[keyof typeof InvoiceStatus];

// Reminder types
export const ReminderType = {
  PAYMENT_DUE: "payment_due",
  OVERDUE_1D: "overdue_1d",
  OVERDUE_7D: "overdue_7d",
  OVERDUE_30D: "overdue_30d",
} as const;
export type ReminderTypeValue = (typeof ReminderType)[keyof typeof ReminderType];

// Reconciliation statuses
export const ReconciliationStatus = {
  UNMATCHED: "unmatched",
  MATCHED: "matched",
  DISPUTED: "disputed",
} as const;
export type ReconciliationStatus = (typeof ReconciliationStatus)[keyof typeof ReconciliationStatus];

// Accounting entry types
export const AccountingEntryType = {
  PAYMENT: "payment",
  REFUND: "refund",
  INVOICE_ISSUED: "invoice_issued",
  INVOICE_PAYMENT: "invoice_payment",
  RECONCILIATION: "reconciliation",
  FEE: "fee",
  ADJUSTMENT: "adjustment",
} as const;
export type AccountingEntryType = (typeof AccountingEntryType)[keyof typeof AccountingEntryType];

// Payment terms
export const PaymentTerms = {
  DUE_ON_RECEIPT: "due_on_receipt",
  NET_7: "net_7",
  NET_15: "net_15",
  NET_30: "net_30",
  PAY_ON_DEPARTURE: "pay_on_departure",
  PAY_ON_ARRIVAL: "pay_on_arrival",
} as const;
export type PaymentTerms = (typeof PaymentTerms)[keyof typeof PaymentTerms];

// Stripe payment statuses
export const StripePaymentStatus = {
  PENDING: "pending",
  REQUIRES_PAYMENT_METHOD: "requires_payment_method",
  REQUIRES_CONFIRMATION: "requires_confirmation",
  REQUIRES_ACTION: "requires_action",
  PROCESSING: "processing",
  SUCCEEDED: "succeeded",
  FAILED: "failed",
  REFUNDED: "refunded",
  PARTIALLY_REFUNDED: "partially_refunded",
} as const;
export type StripePaymentStatus = (typeof StripePaymentStatus)[keyof typeof StripePaymentStatus];

// Invoice item types
export const InvoiceItemType = {
  FARE: "fare",
  PASSENGER_FEE: "passenger_fee",
  FREIGHT: "freight",
  FUEL_SURCHARGE: "fuel_surcharge",
  CARGO: "cargo",
  BAGGAGE: "baggage",
  CANCELLATION_FEE: "cancellation_fee",
  ADJUSTMENT: "adjustment",
  OTHER: "other",
} as const;
export type InvoiceItemType = (typeof InvoiceItemType)[keyof typeof InvoiceItemType];

// Export types
export const ExportType = {
  CSV: "csv",
  XML: "xml",
  XERO: "xero",
  QUICKBOOKS: "quickbooks",
  SAGE: "sage",
  OTHER: "other",
} as const;
export type ExportType = (typeof ExportType)[keyof typeof ExportType];

// Export formats
export const ExportFormat = {
  CSV: "csv",
  XML: "xml",
  JSON: "json",
} as const;
export type ExportFormat = (typeof ExportFormat)[keyof typeof ExportFormat];

// Schedule statuses
export const ScheduleStatus = {
  DRAFT: "draft",
  BUILDING: "building",
  APPROVED: "approved",
  PUBLISHED: "published",
  PILOT_ASSIGNED: "pilot_assigned",
  LOADSHEET_GENERATED: "loadsheet_generated",
  IN_PROGRESS: "in_progress",
  COMPLETED: "completed",
  CANCELLED: "cancelled",
} as const;
export type ScheduleStatusType = (typeof ScheduleStatus)[keyof typeof ScheduleStatus];

// Flight leg statuses
export const FlightLegStatus = {
  SCHEDULED: "scheduled",
  IN_PROGRESS: "in_progress",
  COMPLETED: "completed",
  CANCELLED: "cancelled",
} as const;
export type FlightLegStatusType = (typeof FlightLegStatus)[keyof typeof FlightLegStatus];

// Pilot assignment statuses
export const PilotAssignmentStatus = {
  ASSIGNED: "assigned",
  CONFIRMED: "confirmed",
  DECLINED: "declined",
  CHECKED_IN: "checked_in",
  COMPLETED: "completed",
} as const;
export type PilotAssignmentStatusType = (typeof PilotAssignmentStatus)[keyof typeof PilotAssignmentStatus];

// Pilot roles
export const PilotRole = {
  CAPTAIN: "captain",
  FIRST_OFFICER: "first_officer",
  RELIEF: "relief",
} as const;
export type PilotRoleType = (typeof PilotRole)[keyof typeof PilotRole];

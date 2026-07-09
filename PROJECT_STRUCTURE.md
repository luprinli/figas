# FIGAS-remix-II — Project Structure

```
.
├── .agents/
│   └── skills/
│       ├── _global/
│       │   ├── ci-cd-workflow.md
│       │   ├── code-stability.md
│       │   └── testing-standards.md
│       ├── admin/
│       │   └── SKILL.md
│       ├── booking/
│       │   └── SKILL.md
│       ├── checkin/
│       │   └── SKILL.md
│       ├── figas-test-automation/
│       │   └── SKILL.md
│       ├── finance/
│       │   └── SKILL.md
│       └── flight-schedule/
│           └── SKILL.md
├── .github/
│   └── workflows/
│       ├── ci.yml
│       ├── code-quality.yml
│       ├── e2e.yml
│       └── targeted-tests.yml
├── .husky/
│   ├── _/
│   │   ├── .gitignore
│   │   ├── applypatch-msg
│   │   ├── commit-msg
│   │   ├── h
│   │   ├── husky.sh
│   │   ├── post-applypatch
│   │   ├── post-checkout
│   │   ├── post-commit
│   │   ├── post-merge
│   │   ├── post-rewrite
│   │   ├── pre-applypatch
│   │   ├── pre-auto-gc
│   │   ├── pre-commit
│   │   ├── pre-merge-commit
│   │   ├── prepare-commit-msg
│   │   ├── pre-push
│   │   └── pre-rebase
│   ├── commit-msg
│   └── pre-commit
├── app/
│   ├── components/
│   │   ├── booking/
│   │   │   ├── AirportCodeBadge.tsx
│   │   │   ├── BookingCostSummary.tsx
│   │   │   ├── FlightLegTimeline.tsx
│   │   │   ├── FlightTicket.tsx
│   │   │   ├── PassengerManifest.tsx
│   │   │   ├── PaymentConfirmation.tsx
│   │   │   ├── PaymentMethodSelector.tsx
│   │   │   └── PostBookingChanges.tsx
│   │   ├── checkin/
│   │   │   ├── CardProcessor.tsx
│   │   │   ├── CashKeypad.tsx
│   │   │   └── CheckinSidebar.tsx
│   │   ├── icons/
│   │   │   ├── AircraftIcon.tsx
│   │   │   ├── ArrowRight.tsx
│   │   │   ├── BarcodeIcon.tsx
│   │   │   ├── BoardingPassIcon.tsx
│   │   │   ├── CalendarIcon.tsx
│   │   │   ├── CashIcon.tsx
│   │   │   ├── Close.tsx
│   │   │   ├── CreditCardIcon.tsx
│   │   │   ├── Delete.tsx
│   │   │   ├── FlightPathArc.tsx
│   │   │   ├── FreightIcon.tsx
│   │   │   ├── index.ts
│   │   │   ├── InvoiceIcon.tsx
│   │   │   ├── ItineraryIcon.tsx
│   │   │   ├── LoadingSpinner.tsx
│   │   │   ├── PassengerIcon.tsx
│   │   │   ├── PaymentIcon.tsx
│   │   │   ├── RefundIcon.tsx
│   │   │   ├── RunwayIcon.tsx
│   │   │   ├── TopUpIcon.tsx
│   │   │   ├── WeightIcon.tsx
│   │   │   └── WingIcon.tsx
│   │   ├── loadsheet/
│   │   │   ├── LoadsheetModal.tsx
│   │   │   └── ManifestJourney.tsx
│   │   ├── pilot/
│   │   │   └── PilotBriefing.tsx
│   │   ├── schedule/
│   │   │   ├── AutoBuildPanel.tsx
│   │   │   ├── DraftFlightPlaceholder.tsx
│   │   │   ├── DraggableBookingItem.tsx
│   │   │   ├── DraggableFreightItem.tsx
│   │   │   ├── DraggablePassengerRow.tsx
│   │   │   ├── FlightCard.tsx
│   │   │   ├── FlightCrew.tsx
│   │   │   ├── FlightNotes.tsx
│   │   │   ├── FuelSummary.tsx
│   │   │   ├── Loadsheet.tsx
│   │   │   ├── OptimizationBar.tsx
│   │   │   ├── PilotAssignmentPanel.tsx
│   │   │   ├── RouteStrip.tsx
│   │   │   ├── ScheduleBoard.tsx
│   │   │   ├── ScheduleSkeleton.tsx
│   │   │   ├── ScheduleStatusBar.tsx
│   │   │   ├── SortableDroppableFlightCard.tsx
│   │   │   ├── StopActivityList.tsx
│   │   │   ├── TimelineView.tsx
│   │   │   ├── UnassignPoolPanel.tsx
│   │   │   ├── useScheduleSubscription.ts
│   │   │   ├── ValidationBanner.tsx
│   │   │   └── WeightSummary.tsx
│   │   ├── seat-map/
│   │   │   ├── CGEnvelopeChart.tsx
│   │   │   └── SeatMap.tsx
│   │   ├── ui/
│   │   │   └── ExpandableSection.tsx
│   │   ├── ActivityFeed.tsx
│   │   ├── AgingReceivablesTable.tsx
│   │   ├── AlertBanner.tsx
│   │   ├── AlertStrip.tsx
│   │   ├── Badge.tsx
│   │   ├── BookingCard.tsx
│   │   ├── BookingTimeline.tsx
│   │   ├── BookingWizard.tsx
│   │   ├── Button.tsx
│   │   ├── Card.tsx
│   │   ├── ClientGroup.tsx
│   │   ├── CodeBlock.tsx
│   │   ├── ConfirmDialog.tsx
│   │   ├── CostBreakdown.tsx
│   │   ├── CountdownBar.tsx
│   │   ├── DashboardCard.tsx
│   │   ├── DataGrid.tsx
│   │   ├── DataTable.tsx
│   │   ├── DatePicker.tsx
│   │   ├── DateRangePicker.tsx
│   │   ├── DOBPicker.tsx
│   │   ├── EmptyState.tsx
│   │   ├── ErrorBoundary.tsx
│   │   ├── ExportFormatSelector.tsx
│   │   ├── FinanceKPICard.tsx
│   │   ├── GlobalErrorBoundary.tsx
│   │   ├── InvoiceStatusBadge.tsx
│   │   ├── InvoiceView.tsx
│   │   ├── ItineraryGroup.tsx
│   │   ├── LegsTable.tsx
│   │   ├── Logo.tsx
│   │   ├── NotificationBell.tsx
│   │   ├── PageHeader.tsx
│   │   ├── PageLayout.tsx
│   │   ├── Pagination.tsx
│   │   ├── PassengerForm.tsx
│   │   ├── PassengerSearchCombobox.tsx
│   │   ├── PassengersTable.tsx
│   │   ├── PaymentStatusBadge.tsx
│   │   ├── PaymentTimeline.tsx
│   │   ├── Popup.tsx
│   │   ├── PrintButton.tsx
│   │   ├── ProfilePopup.tsx
│   │   ├── ProgressBar.tsx
│   │   ├── ReconciliationTable.tsx
│   │   ├── RouteSelector.tsx
│   │   ├── Sidebar.tsx
│   │   ├── SidebarLayout.tsx
│   │   ├── Skeleton.tsx
│   │   ├── Sparkline.tsx
│   │   ├── StatCard.tsx
│   │   ├── StatusBadge.tsx
│   │   ├── SystemHealth.tsx
│   │   ├── TextField.tsx
│   │   ├── ThemeProvider.tsx
│   │   ├── TimePicker.tsx
│   │   ├── Toast.tsx
│   │   ├── WeightBar.tsx
│   │   └── WeightSummary.tsx
│   ├── hooks/
│   │   └── useScheduleShortcuts.ts
│   ├── routes/
│   │   ├── _auth.login.tsx
│   │   ├── _auth.logout.tsx
│   │   ├── _auth.reset-password.tsx
│   │   ├── _auth.signup.tsx
│   │   ├── _auth.tsx
│   │   ├── _auth.verify-email.tsx
│   │   ├── _index.tsx
│   │   ├── admin._index.tsx
│   │   ├── admin.aerodrome-distances.tsx
│   │   ├── admin.aerodrome-headings.tsx
│   │   ├── admin.aerodromes.tsx
│   │   ├── admin.aircraft.tsx
│   │   ├── admin.airframe-hours.tsx
│   │   ├── admin.fares.tsx
│   │   ├── admin.fuel-rules.tsx
│   │   ├── admin.settings.tsx
│   │   ├── admin.tsx
│   │   ├── admin.users.tsx
│   │   ├── agent.bookings.$bookingId.tsx
│   │   ├── agent.bookings._index.tsx
│   │   ├── api.schedule-events.ts
│   │   ├── api.stripe-webhook.ts
│   │   ├── bookings.$bookingId.payment.tsx
│   │   ├── bookings.$bookingId.payment-cancel.tsx
│   │   ├── bookings.$bookingId.payment-success.tsx
│   │   ├── bookings.$bookingId.tsx
│   │   ├── bookings._index.tsx
│   │   ├── bookings.new.tsx
│   │   ├── bookings.tsx
│   │   ├── checkin._index.tsx
│   │   ├── checkin.counter.tsx
│   │   ├── checkin.freight.tsx
│   │   ├── checkin.lookup.tsx
│   │   ├── checkin.pos.tsx
│   │   ├── checkin.tsx
│   │   ├── engineer._index.tsx
│   │   ├── engineer.aircraft.tsx
│   │   ├── engineer.airframe-hours.tsx
│   │   ├── engineer.components.tsx
│   │   ├── engineer.defects.tsx
│   │   ├── engineer.flights.tsx
│   │   ├── engineer.loadsheets.tsx
│   │   ├── engineer.maintenance.tsx
│   │   ├── engineer.tasks.tsx
│   │   ├── engineer.tsx
│   │   ├── finance._index.tsx
│   │   ├── finance.bookings.tsx
│   │   ├── finance.exports.tsx
│   │   ├── finance.flights.tsx
│   │   ├── finance.invoices.$invoiceId.tsx
│   │   ├── finance.invoices.tsx
│   │   ├── finance.payments.tsx
│   │   ├── finance.reconciliation.tsx
│   │   ├── finance.reports.aging.tsx
│   │   ├── finance.reports.daily-sales.tsx
│   │   ├── finance.reports.payment-summary.tsx
│   │   ├── finance.reports.tax.tsx
│   │   ├── finance.reports.tsx
│   │   ├── finance.settings.tsx
│   │   ├── finance.tsx
│   │   ├── operations._index.tsx
│   │   ├── operations.bookings.$bookingId.cancel.tsx
│   │   ├── operations.bookings.$bookingId.edit.tsx
│   │   ├── operations.bookings.$bookingId.passengers.tsx
│   │   ├── operations.bookings.$bookingId.payment-cancel.tsx
│   │   ├── operations.bookings.$bookingId.payment-success.tsx
│   │   ├── operations.bookings.$bookingId.tsx
│   │   ├── operations.bookings._index.tsx
│   │   ├── operations.bookings.new.tsx
│   │   ├── operations.loadsheets._index.tsx
│   │   ├── operations.no-fly-days.tsx
│   │   ├── operations.notifications.tsx
│   │   ├── operations.schedule.$scheduleId.tsx
│   │   ├── operations.schedule._index/
│   │   │   ├── action.server.ts
│   │   │   ├── loader.ts
│   │   │   ├── route.tsx
│   │   │   └── shared.ts
│   │   ├── operations.tsx
│   │   ├── ops.flight.$flightId.loadsheet.print.tsx
│   │   ├── ops.flight.$flightId.loadsheet.tsx
│   │   ├── ops.flight.$flightId.passengers.tsx
│   │   ├── pilot._index.tsx
│   │   ├── pilot.briefing.$flightId.tsx
│   │   ├── pilot.flights.tsx
│   │   ├── pilot.schedule.tsx
│   │   ├── pilot.tsx
│   │   ├── profile.tsx
│   │   ├── schedule.$token.tsx
│   │   ├── settings.tsx
│   │   └── $.tsx
│   ├── styles/
│   │   ├── print.css
│   │   ├── tailwind.css
│   │   └── ticket-print.css
│   ├── utils/
│   │   ├── loadsheet/
│   │   │   ├── create-loadsheet.server.ts
│   │   │   ├── loadsheet-calculations.server.ts
│   │   │   ├── loadsheet-repository.server.ts
│   │   │   └── seat-assignment.ts
│   │   ├── pricing/
│   │   │   ├── booking-costing.server.ts
│   │   │   ├── fare-import.server.ts
│   │   │   ├── invoice-lines.server.ts
│   │   │   ├── payment-allocation.server.ts
│   │   │   └── pricing-engine.server.ts
│   │   ├── publishing/
│   │   │   └── publish.server.ts
│   │   ├── repositories/
│   │   │   ├── accounting-entry.ts
│   │   │   ├── admin.ts
│   │   │   ├── aerodrome.ts
│   │   │   ├── aircraft.ts
│   │   │   ├── bank-transaction.ts
│   │   │   ├── booking.ts
│   │   │   ├── booking-leg.server.ts
│   │   │   ├── booking-leg.ts
│   │   │   ├── booking-leg-passenger.ts
│   │   │   ├── booking-passenger.ts
│   │   │   ├── checkin.ts
│   │   │   ├── export-log.ts
│   │   │   ├── fare-route.ts
│   │   │   ├── flight.ts
│   │   │   ├── flight-leg.ts
│   │   │   ├── invoice.ts
│   │   │   ├── invoice-item.ts
│   │   │   ├── notification.ts
│   │   │   ├── organization.ts
│   │   │   ├── payment-method.ts
│   │   │   ├── payment-reminder.ts
│   │   │   ├── pilot-assignment.ts
│   │   │   ├── schedule.ts
│   │   │   ├── shared.ts
│   │   │   ├── stripe-payment.ts
│   │   │   ├── transaction.ts
│   │   │   ├── webhook-event.ts
│   │   │   └── weight-balance.ts
│   │   ├── scheduling/
│   │   │   ├── assign-aircraft.ts
│   │   │   ├── assign-pilots.ts
│   │   │   ├── build-flight-card-flight.ts
│   │   │   ├── build-stop-activities.ts
│   │   │   ├── capacity-check.ts
│   │   │   ├── cluster-bookings.ts
│   │   │   ├── config-generator.ts
│   │   │   ├── config-scorer.ts
│   │   │   ├── cvrp-solver.ts
│   │   │   ├── cvrp-types.ts
│   │   │   ├── cvrp-validator.ts
│   │   │   ├── distance-lookup.ts
│   │   │   ├── flight-validation.ts
│   │   │   ├── fuel-data.server.ts
│   │   │   ├── fuel-data.ts
│   │   │   ├── fuel-lookup.ts
│   │   │   ├── fuel-planning.ts
│   │   │   ├── index.ts
│   │   │   ├── insert-passenger-route.ts
│   │   │   ├── runway-derating.ts
│   │   │   ├── scheduling-types.ts
│   │   │   ├── suggest-route.server.ts
│   │   │   ├── suggest-route.ts
│   │   │   ├── types.ts
│   │   │   └── weight-balance.ts
│   │   ├── services/
│   │   │   ├── config.server.ts
│   │   │   ├── export.service.ts
│   │   │   ├── fare-calculator.server.ts
│   │   │   ├── fare-calculator.ts
│   │   │   ├── invoice.service.ts
│   │   │   ├── maintenance-alerts.server.ts
│   │   │   ├── no-fly.service.ts
│   │   │   ├── payment.service.ts
│   │   │   ├── reconciliation.service.ts
│   │   │   ├── reminder.service.ts
│   │   │   └── weather.server.ts
│   │   ├── airframe-hours.server.ts
│   │   ├── auth.server.ts
│   │   ├── bigint.ts
│   │   ├── check-in-time.server.ts
│   │   ├── constants.ts
│   │   ├── csrf.server.ts
│   │   ├── dates.ts
│   │   ├── db.server.ts
│   │   ├── flight-number.server.ts
│   │   ├── format-compact-name.ts
│   │   ├── form-data.ts
│   │   ├── layout.server.ts
│   │   ├── migrate.ts
│   │   ├── password.server.ts
│   │   ├── pdf.server.ts
│   │   ├── permissions.server.ts
│   │   ├── print.client.ts
│   │   ├── schedule-handlers.server.ts
│   │   ├── seed.ts
│   │   ├── stripe.server.ts
│   │   └── toast.ts
│   ├── entry.client.tsx
│   ├── root.tsx
│   └── session.server.ts
├── build/
│   ├── client/
│   │   ├── assets/
│   │   │   └── [~180 bundled .js/.css files]
│   │   ├── favicon.ico
│   │   ├── guides/
│   │   │   └── [7 image files]
│   │   ├── icons/
│   │   │   └── [3 SVG icon files]
│   │   ├── illustration_auth.svg
│   │   ├── illustration_dark.svg
│   │   ├── illustration_light.svg
│   │   ├── manifest.json
│   │   ├── sw.js
│   │   └── user.jpg
│   └── server/
│       ├── assets/
│       │   └── [9 bundled .js modules + 1 .wasm]
│       ├── index.js
│       └── server.js
├── data/
│   ├── archive/
│   │   ├── distance.csv
│   │   ├── FlightList.csv
│   │   ├── fuel.csv
│   │   ├── heading.csv
│   │   └── pilots.csv
│   ├── islander_pics/
│   │   ├── FGAS.jpeg
│   │   ├── figas.webp
│   │   ├── figas2.webp
│   │   └── illustration.svg
│   ├── processed/
│   │   ├── fare-matrix-structured.json
│   │   ├── fare-schema.json
│   │   └── fare-summary.csv
│   ├── aerodromes.csv
│   ├── aircraft.csv
│   ├── airframe_hours.csv
│   ├── distance.csv
│   ├── FlightList.csv
│   ├── fuel.csv
│   ├── heading.csv
│   ├── MATRIX FARES.txt
│   ├── MATRIX_FARES.csv
│   └── pilots.csv
├── docs/
│   ├── archive/
│   │   ├── booking-architecture-plan.md
│   │   ├── database-audit-phase1.md
│   │   ├── database-audit-phase2-env.md
│   │   ├── database-audit-phase3-duplicates.md
│   │   ├── database-audit-verification.md
│   │   ├── documentation-harmonization-plan.md
│   │   ├── kanban-pattern-recommendations.md
│   │   ├── loadsheet-technical-plan.md
│   │   ├── publishing-print-specification.md
│   │   ├── schedule-backup-gap-analysis.md
│   │   ├── scheduling-audit-report.md
│   │   ├── scheduling-flight-assignment-plan.md
│   │   ├── scheduling-implementation-plan.md
│   │   ├── scheduling-integration-points.md
│   │   ├── scheduling-lsc-audit-implementation-plan.md
│   │   ├── scheduling-migration-plan.md
│   │   ├── scheduling-route-map.md
│   │   ├── scheduling-ui-components.md
│   │   ├── scheduling-workflow-pipeline.md
│   │   └── schema-redesign-passenger-leg.md
│   ├── AI_code_stability_best_practice.md
│   ├── AI-stability-CI-CD-implementation-plan.md
│   ├── ARCHITECTURE.md
│   ├── business-rules.md
│   ├── checkin-implementation-audit.md
│   ├── checkin-ux-audit-report.md
│   ├── DATA_MODEL.md
│   ├── DATABASE-AUDIT-SUMMARY.md
│   ├── SCHEDULING.md
│   ├── scheduling-audit.md
│   ├── seed-data-plan.md
│   ├── SETUP.md
│   └── WORKFLOWS.md
├── generated/
│   └── prisma/
│       ├── internal/
│       │   ├── class.ts
│       │   ├── prismaNamespace.ts
│       │   └── prismaNamespaceBrowser.ts
│       ├── models/
│       │   ├── accounting_journal_entries.ts
│       │   ├── accounting_journal_lines.ts
│       │   ├── aerodrome_distances.ts
│       │   ├── aerodrome_headings.ts
│       │   ├── aerodromes.ts
│       │   ├── aircraft.ts
│       │   ├── aircraft_assignments.ts
│       │   ├── airframe_hours.ts
│       │   ├── ata_chapters.ts
│       │   ├── audit_log.ts
│       │   ├── bank_transactions.ts
│       │   ├── booking_leg_passengers.ts
│       │   ├── booking_legs.ts
│       │   ├── booking_passengers.ts
│       │   ├── bookings.ts
│       │   ├── chart_of_accounts.ts
│       │   ├── checkin_reminders.ts
│       │   ├── data_table_migrations.ts
│       │   ├── defects.ts
│       │   ├── email_verification_tokens.ts
│       │   ├── export_log.ts
│       │   ├── fare_matrix.ts
│       │   ├── fare_routes.ts
│       │   ├── flight_legs.ts
│       │   ├── flight_logs.ts
│       │   ├── flight_manifests.ts
│       │   ├── flights.ts
│       │   ├── fuel_rules.ts
│       │   ├── invoice_items.ts
│       │   ├── invoice_line_items.ts
│       │   ├── invoices.ts
│       │   ├── lifed_components.ts
│       │   ├── loadsheet_audit_log.ts
│       │   ├── loadsheet_passengers.ts
│       │   ├── loadsheet_sectors.ts
│       │   ├── loadsheets.ts
│       │   ├── maintenance_tasks.ts
│       │   ├── migrations.ts
│       │   ├── no_fly_rules.ts
│       │   ├── notifications.ts
│       │   ├── organizations.ts
│       │   ├── password_reset_tokens.ts
│       │   ├── payment_allocations.ts
│       │   ├── payment_methods.ts
│       │   ├── payment_reminders.ts
│       │   ├── payments.ts
│       │   ├── permissions.ts
│       │   ├── pilot_assignments.ts
│       │   ├── pilots.ts
│       │   ├── published_schedule_flights.ts
│       │   ├── published_schedules.ts
│       │   ├── role_permissions.ts
│       │   ├── roles.ts
│       │   ├── schedules.ts
│       │   ├── seat_assignments.ts
│       │   ├── sign_offs.ts
│       │   ├── stripe_payments.ts
│       │   ├── system_settings.ts
│       │   ├── time_templates.ts
│       │   ├── user_roles.ts
│       │   ├── users.ts
│       │   └── weight_balance_snapshots.ts
│       ├── browser.ts
│       ├── client.ts
│       ├── commonInputTypes.ts
│       ├── enums.ts
│       └── models.ts
├── migrations/
│   ├── archive/
│   │   ├── 001_create_tables.sql
│   │   ├── 002_add_missing_columns.sql
│   │   ├── 003_create_reference_tables.sql
│   │   ├── 004_add_timestamps_to_reference_tables.sql
│   │   ├── 005_add_booking_source_and_cancellation.sql
│   │   ├── 006_create_payment_methods.sql
│   │   ├── 007_create_invoices.sql
│   │   ├── 008_create_accounting_journal.sql
│   │   ├── 009_create_payment_reminders.sql
│   │   ├── 010_create_stripe_payments.sql
│   │   ├── 011_create_bank_transactions.sql
│   │   ├── 012_create_export_log.sql
│   │   ├── 013_enhance_existing_tables.sql
│   │   ├── 014_create_scheduling_tables.sql
│   │   ├── 015_create_rbac_tables.sql
│   │   ├── 016_create_booking_leg_passengers.sql
│   │   ├── 017_create_no_fly_dates.sql
│   │   ├── 018_alter_no_fly_rules_day_of_week_array.sql
│   │   └── 019_add_schedule_audit_and_weight_balance.sql
│   ├── consolidated/
│   │   ├── 001-core-schema.sql
│   │   ├── 002-reference-data.sql
│   │   ├── 003-finance.sql
│   │   ├── 004-scheduling.sql
│   │   ├── 005-pbac.sql
│   │   ├── 006-no-fly.sql
│   │   └── 007-triggers-and-functions.sql
│   ├── 008-system-settings.sql
│   ├── 009-add-loadsheet-permissions.sql
│   ├── 010-webhook-events.sql
│   ├── 011-flight-logs.sql
│   ├── 012-maintenance-tasks.sql
│   ├── 013-defects.sql
│   ├── 014-lifed-components.sql
│   ├── 015-sign-offs.sql
│   ├── 016-ata-chapters.sql
│   ├── 017-maintenance-triggers.sql
│   ├── 018-freight.sql
│   ├── add-aircraft-assignments.sql
│   ├── add-booking-enhancements.sql
│   ├── add-fare-matrix.sql
│   ├── add-loadsheet-permissions.sql
│   ├── add-loadsheet-tables.sql
│   ├── add-published-schedules.sql
│   ├── fix-add-flight-leg-id.sql
│   ├── fix-aircraft-arm-positions.sql
│   ├── fix-aircraft-id-nullable.sql
│   ├── fix-booking-leg-passengers-unique.sql
│   ├── fix-flight-leg-status-enum.sql
│   ├── fix-flights-created-by.sql
│   ├── fix-loadsheet-sector-fk.sql
│   ├── fix-schedule-status-enum.sql
│   └── fix-schema-mismatches.sql
├── plans/
│   └── MASTER-PLAN.md
├── prisma/
│   ├── audit-bookings.ts
│   ├── audit-db.ts
│   ├── cleanup-test-data.ts
│   ├── diagnostic-schedule.ts
│   ├── migrate-users-to-pbac.ts
│   ├── repair-leg-passengers.ts
│   ├── schema.prisma
│   ├── seed-pbac.ts
│   └── seed-realistic-bookings.ts
├── public/
│   ├── guides/
│   │   └── [7 image files]
│   ├── icons/
│   │   └── [3 SVG icon files]
│   ├── favicon.ico
│   ├── illustration_auth.svg
│   ├── illustration_dark.svg
│   ├── illustration_light.svg
│   ├── manifest.json
│   ├── sw.js
│   └── user.jpg
├── scripts/
│   ├── ci/
│   │   ├── detect-changed-suites.js
│   │   ├── trigger-map.json
│   │   └── verify-invariants.js
│   ├── lib/
│   │   ├── booking-writer.ts
│   │   ├── date-utils.ts
│   │   ├── itinerary-builder.ts
│   │   ├── passenger-generator.ts
│   │   ├── reference-data.ts
│   │   └── types.ts
│   ├── add-unique-constraints.ts
│   ├── analyze-schemas.ts
│   ├── apply-fix-migrations.ts
│   ├── apply-freight-migration.ts
│   ├── apply-migration-test-db.ts
│   ├── apply-remaining-fixes.ts
│   ├── assign-user-roles.ts
│   ├── audit-blp-integrity.ts
│   ├── audit-flights.ts
│   ├── audit-pilots.ts
│   ├── check-10227.ts
│   ├── check-all-dates.ts
│   ├── check-arms.ts
│   ├── check-blp-constraints.ts
│   ├── check-coa.ts
│   ├── check-db.ts
│   ├── check-db-state.ts
│   ├── check-duplicates.ts
│   ├── check-fig060601.ts
│   ├── check-fig10265.ts
│   ├── check-finance-refs.ts
│   ├── check-flight148.ts
│   ├── check-flight150.ts
│   ├── check-integrity.ts
│   ├── check-june16.ts
│   ├── check-june19-data.ts
│   ├── check-legs.ts
│   ├── check-loadsheet-sync.ts
│   ├── check-nofly.ts
│   ├── check-perms.ts
│   ├── check-pilots.ts
│   ├── check-schema-columns.ts
│   ├── check-selfloops.ts
│   ├── check-state.ts
│   ├── check-subschemas.ts
│   ├── check-unique.ts
│   ├── check-wb-data.ts
│   ├── clean-legacy-flights.ts
│   ├── cleanup-duplicates.ts
│   ├── cleanup-legacy-pilots.ts
│   ├── debug-cvrp.ts
│   ├── debug-dups.ts
│   ├── debug-finance.ts
│   ├── fix-blp-index.ts
│   ├── fix-dup-names.ts
│   ├── fix-legacy-blp.ts
│   ├── fix-missing-blp.ts
│   ├── fix-missing-pilots.ts
│   ├── fix-nofly-and-schema.ts
│   ├── fix-nofly-dates.ts
│   ├── fix-nonsty-origins.ts
│   ├── fix-pilot-names.ts
│   ├── fix-schedules.ts
│   ├── fix-selfloops.ts
│   ├── fix-stale-loadsheets.ts
│   ├── rebuild-schedules.ts
│   ├── reset-auto-build.ts
│   ├── reset-bookings.ts
│   ├── reset-schema.ts
│   ├── reset-test-data.ts
│   ├── restore-june19-blp.ts
│   ├── restore-missing-blp.ts
│   ├── restore-origins.ts
│   ├── seed-bookings.ts
│   ├── seed-comprehensive.ts
│   ├── seed-config.ts
│   ├── seed-e2e-drag-test.ts
│   ├── seed-financial-records.ts
│   ├── seed-full.ts
│   ├── seed-reference-data.ts
│   ├── seed-test-db.ts
│   ├── seed-users.ts
│   ├── test-capacity-fill.ts
│   ├── test-stops.ts
│   └── test-wb-overflow.ts
├── tests/
│   ├── e2e/
│   │   ├── helpers/
│   │   │   └── drag-simulator.ts
│   │   ├── pages/
│   │   │   └── schedule-page.ts
│   │   ├── accessibility.spec.ts
│   │   ├── admin.spec.ts
│   │   ├── auth.spec.ts
│   │   ├── auth-state.json
│   │   ├── auto-build-automation.spec.ts
│   │   ├── bookings.spec.ts
│   │   ├── checkin.spec.ts
│   │   ├── finance.spec.ts
│   │   ├── global-setup.ts
│   │   ├── loadsheet-verification.png
│   │   ├── schedule-drag-passenger.spec.ts
│   │   ├── schedule-drag-validation.spec.ts
│   │   └── scheduling.spec.ts
│   ├── fixtures/
│   │   ├── factories.ts
│   │   ├── helpers.ts
│   │   └── seed-data.ts
│   ├── integration/
│   │   ├── checkin/
│   │   │   ├── checkin-payment-edge-cases.test.ts
│   │   │   ├── checkin-transaction.test.ts
│   │   │   └── checkin-weight-validation.test.ts
│   │   └── scheduling/
│   │       ├── assign-booking.test.ts
│   │       ├── auto-build.test.ts
│   │       ├── error-cases.test.ts
│   │       ├── multi-flight-auto-build.test.ts
│   │       ├── permissions.test.ts
│   │       ├── schedule-status-flow.test.ts
│   │       ├── unassign-booking.test.ts
│   │       └── unassigned-by-date.test.ts
│   ├── smoke/
│   │   ├── auth.smoke.ts
│   │   ├── booking-list.smoke.ts
│   │   ├── checkin-counter.smoke.ts
│   │   ├── navigation.smoke.ts
│   │   └── schedule-board.smoke.ts
│   └── unit/
│       ├── checkin/
│       │   └── counter.test.ts
│       ├── loadsheet/
│       │   └── loadsheet-calculations.test.ts
│       ├── scheduling/
│       │   ├── cluster-bookings.test.ts
│       │   ├── cvrp-solver.test.ts
│       │   ├── flight-validation.test.ts
│       │   ├── fuel-planning.test.ts
│       │   └── insert-passenger-route.test.ts
│       ├── utils/
│       │   ├── dates.test.ts
│       │   └── form-data.test.ts
│       ├── sanity.test.ts
│       └── setup.ts
├── .env
├── .env.example
├── .eslintrc.cjs
├── .gitignore
├── .nvmrc
├── .prettierignore
├── .prettierrc
├── AGENTS.md
├── commitlint.config.js
├── kilo.json
├── LICENSE
├── package.json
├── package-lock.json
├── playwright.config.ts
├── postcss.config.js
├── prisma.config.ts
├── README.md
├── render.yaml
├── renovate.json
├── tsconfig.json
├── vite.config.ts
└── vitest.config.ts
```

## Summary

| Directory | Purpose |
|-----------|---------|
| `.agents/` | Domain skill definitions (admin, booking, checkin, finance, flight-schedule, figas-test-automation) |
| `.github/workflows/` | CI/CD pipelines (ci, code-quality, e2e, targeted-tests) |
| `.husky/` | Git hooks (commit-msg, pre-commit) |
| `render.yaml` | Render deployment blueprint (web service + PostgreSQL) |
| `app/components/` | React components organized by domain (booking, checkin, schedule, loadsheet, icons, etc.) |
| `app/routes/` | Remix file-based routes covering all modules (auth, admin, ops, finance, checkin, pilot, engineer, bookings) |
| `app/utils/` | Server-side utilities (repositories, scheduling engine, pricing, loadsheet, services) |
| `build/` | Production build output (client bundles + server assets) |
| `data/` | CSV seed data (aerodromes, aircraft, pilots, fares, fuel) |
| `docs/` | Project documentation, audit reports, and architecture docs |
| `generated/prisma/` | Prisma client types and model definitions (auto-generated) |
| `migrations/` | SQL migrations (archived, consolidated, and active fixes) |
| `plans/` | High-level master plan |
| `prisma/` | Prisma schema, seed scripts, and data utilities |
| `public/` | Static assets (favicon, icons, illustrations, PWA manifest) |
| `scripts/` | Database maintenance, integrity checks, seeders, and CI helpers |
| `tests/` | Test suites (unit, integration, e2e/smoke with Playwright + Vitest) |

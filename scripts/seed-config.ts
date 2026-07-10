import { db } from "../app/utils/db.server";
import { sql } from "kysely";

async function seedConfig() {
  console.log("Seeding system_settings...");

  const settings: Array<[string, string, string, string]> = [
    ["fare.default_per_passenger", "50", "number", "Fallback fare per passenger"],
    ["fare.freight_rate_per_kg", "2", "number", "Freight rate GBP per kg"],
    ["pilot.rest_hours", "12", "number", "Minimum rest hours between duties"],
    ["pilot.max_duty_hours", "12", "number", "Maximum duty hours per day"],
    ["pilot.max_flight_hours", "8", "number", "Maximum flight hours per day"],
    ["aircraft.default_cruise_speed_ktas", "140", "number", "Default cruise speed KTAS"],
    ["aircraft.default_burn_rate_kg_hr", "45", "number", "Default fuel burn rate kg/hr"],
    ["aircraft.default_empty_weight_kg", "1627", "number", "Default empty weight kg"],
    ["aircraft.default_mtow_kg", "2994", "number", "Default MTOW kg"],
    ["aircraft.taxi_minutes", "10", "number", "Taxi time minutes"],
    ["aircraft.turnaround_minutes", "10", "number", "Turnaround time minutes"],
    ["aircraft.reserve_fuel_kg", "35", "number", "Reserve fuel kg"],
    ["aircraft.taxi_fuel_kg", "3", "number", "Taxi fuel kg"],
    ["aircraft.pilot_weight_kg", "80", "number", "Standard pilot weight kg"],
    ["booking.max_passengers", "9", "number", "Max passengers per booking"],
    ["booking.max_legs", "4", "number", "Max legs per booking"],
    ["booking.payment_term_days", "30", "number", "Default payment term days"],
    ["booking.calendar_lookahead_days", "90", "number", "Calendar lookahead days"],
    ["page.default_size", "20", "number", "Default page size"],
    ["accounting.cash_at_bank", "1010", "string", "Cash at Bank account code"],
    ["accounting.accounts_receivable", "1020", "string", "Accounts Receivable code"],
    ["accounting.passenger_fare_revenue", "4010", "string", "Passenger Fare Revenue code"],
  ];

  for (const [key, value, type, description] of settings) {
    await sql`
      INSERT INTO system_settings (key, value, type, description, updated_at)
       VALUES (${key}, ${value}, ${type}, ${description}, NOW())
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, description = EXCLUDED.description, updated_at = NOW()
    `.execute(db);
    console.log(`  ${key} = ${value}`);
  }

  console.log("system_settings seeded successfully.");
  process.exit(0);
}

seedConfig().catch((err) => {
  console.error("Failed to seed config:", err);
  process.exit(1);
});

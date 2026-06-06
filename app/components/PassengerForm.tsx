import { Form, useActionData } from "@remix-run/react";
import PassengerIcon from "./icons/PassengerIcon";

interface PassengerFormProps {
  passengerCount: number;
}

export default function PassengerForm({ passengerCount }: PassengerFormProps) {
  const actionData = useActionData<{ error?: string }>();

  return (
    <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4 shadow-sm dark:shadow-slate-900/20">
      <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-3 flex items-center gap-2">
        <PassengerIcon className="w-5 h-5 text-sky-600" />
        {passengerCount > 0 ? "Add Another Passenger" : "Add Passenger"}
      </h3>

      {actionData?.error && (
        <div className="mb-4 rounded-lg bg-red-50 dark:bg-red-900/30 border border-red-200 p-4 text-sm text-red-700">
          {actionData.error}
        </div>
      )}

      <Form method="post" className="space-y-4">
        <input type="hidden" name="intent" value="add" />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="first_name" className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">
              First Name
            </label>
            <input
              type="text"
              id="first_name"
              name="first_name"
              required
              className="block w-full rounded-lg border border-slate-300 dark:border-slate-600 dark:border-slate-600 px-3 py-2 text-sm shadow-sm dark:shadow-slate-900/20 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
            />
          </div>
          <div>
            <label htmlFor="last_name" className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">
              Last Name
            </label>
            <input
              type="text"
              id="last_name"
              name="last_name"
              required
              className="block w-full rounded-lg border border-slate-300 dark:border-slate-600 dark:border-slate-600 px-3 py-2 text-sm shadow-sm dark:shadow-slate-900/20 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
            />
          </div>
        </div>

        <div>
          <label htmlFor="email" className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">
            Email
          </label>
          <input
            type="email"
            id="email"
            name="email"
            required
            className="block w-full rounded-lg border border-slate-300 dark:border-slate-600 dark:border-slate-600 px-3 py-2 text-sm shadow-sm dark:shadow-slate-900/20 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="phone" className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">
              Phone
            </label>
            <input
              type="tel"
              id="phone"
              name="phone"
              className="block w-full rounded-lg border border-slate-300 dark:border-slate-600 dark:border-slate-600 px-3 py-2 text-sm shadow-sm dark:shadow-slate-900/20 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
            />
          </div>
          <div>
            <label htmlFor="weight" className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">
              Weight (kg)
            </label>
            <input
              type="number"
              id="weight"
              name="weight"
              min="0"
              step="0.1"
              className="block w-full rounded-lg border border-slate-300 dark:border-slate-600 dark:border-slate-600 px-3 py-2 text-sm shadow-sm dark:shadow-slate-900/20 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
              placeholder="70"
            />
          </div>
        </div>

        <div>
          <label htmlFor="special_requirements" className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">
            Special Requirements
          </label>
          <textarea
            id="special_requirements"
            name="special_requirements"
            rows={2}
            className="block w-full rounded-lg border border-slate-300 dark:border-slate-600 dark:border-slate-600 px-3 py-2 text-sm shadow-sm dark:shadow-slate-900/20 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
            placeholder="e.g. wheelchair assistance, dietary restrictions, medical conditions..."
          />
        </div>

        <div className="flex items-center gap-3 pt-2">
          <button
            type="submit"
            className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700 transition-colors"
          >
            {passengerCount > 0 ? "Add Passenger" : "Save Passenger"}
          </button>
        </div>
      </Form>
    </div>
  );
}

import { Form, useActionData } from "@remix-run/react";
import Button from "./Button";
import TextField from "./TextField";
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
        <div className="mb-4 rounded-lg bg-red-50 dark:bg-red-900/30 border border-red-200 p-4 text-sm text-red-700" role="alert">
          {actionData.error}
        </div>
      )}

      <Form method="post" className="space-y-4">
        <input type="hidden" name="intent" value="add" />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <TextField id="first_name" name="first_name" label="First Name" required />
          <TextField id="last_name" name="last_name" label="Last Name" required />
        </div>

        <TextField id="email" name="email" type="email" label="Email" required />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <TextField id="phone" name="phone" type="tel" label="Phone" />
          <TextField id="weight" name="weight" type="number" label="Weight (kg)" placeholder="70" hint="Body weight in kilograms" />
        </div>

        <div>
          <label htmlFor="special_requirements" className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">
            Special Requirements
          </label>
          <textarea
            id="special_requirements"
            name="special_requirements"
            rows={2}
            className="block w-full rounded-lg border border-slate-300 dark:border-slate-600 px-3 py-2 text-sm shadow-sm dark:shadow-slate-900/20 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
            placeholder="e.g. wheelchair assistance, dietary restrictions, medical conditions..."
          />
        </div>

        <div className="flex items-center gap-3 pt-2">
          <Button type="submit" color="primary">
            {passengerCount > 0 ? "Add Passenger" : "Save Passenger"}
          </Button>
        </div>
      </Form>
    </div>
  );
}

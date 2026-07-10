import type { ActionFunctionArgs, LoaderFunctionArgs, MetaFunction } from "@remix-run/node";
import { json } from "@remix-run/node";
import { Form, useActionData, useLoaderData , useRouteError, isRouteErrorResponse } from "@remix-run/react";

import { useState } from "react";
import { requireAuth } from "../utils/auth.server";
import { kdb } from "../utils/db.server.kysely";
import { bookingRepository } from "../utils/repositories/booking";
import { verifyPassword, hashPassword } from "../utils/password.server";
import DOBPicker from "../components/DOBPicker";

export const meta: MetaFunction = () => [{ title: "Profile - FIGAS" }];

interface ActionData {
  profileSuccess?: string;
  profileError?: string;
  passwordSuccess?: string;
  passwordError?: string;
}

export async function loader({ request }: LoaderFunctionArgs) {
  const userId = await requireAuth(request);
  const user = (await kdb.selectFrom("users").select([
    "id",
    "name",
    "email",
    "phone",
    "date_of_birth",
    "nationality",
    "residency_status",
    "emergency_contact_name",
    "emergency_contact_phone",
    "id_document_type",
    "id_document_number",
    "password",
  ]).where("id", "=", Number(userId)).execute())[0] ?? null;

  if (!user) {
    throw new Response("User not found", { status: 404 });
  }

  const upcomingBookings = await bookingRepository.findUpcomingByUserId(Number(userId));

  return json({
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      date_of_birth: user.date_of_birth,
      nationality: user.nationality,
      residency_status: user.residency_status,
      emergency_contact_name: user.emergency_contact_name,
      emergency_contact_phone: user.emergency_contact_phone,
      id_document_type: user.id_document_type,
      id_document_number: user.id_document_number,
    },
    upcomingBookings,
  });
}

export async function action({ request }: ActionFunctionArgs) {
  const userId = await requireAuth(request);
  const formData = await request.formData();
  const intent = formData.get("intent")?.toString();

  if (intent === "update_profile") {
    const name = formData.get("name")?.toString().trim();
    const phone = formData.get("phone")?.toString().trim() || null;
    const dateOfBirth = formData.get("date_of_birth")?.toString() || null;
    const nationality = formData.get("nationality")?.toString().trim() || null;
    const residency = formData.get("residency_status")?.toString() || null;
    const emergencyContactName = formData.get("emergency_contact_name")?.toString().trim() || null;
    const emergencyContactPhone = formData.get("emergency_contact_phone")?.toString().trim() || null;
    const idDocumentType = formData.get("id_document_type")?.toString() || null;
    const idDocumentNumber = formData.get("id_document_number")?.toString().trim() || null;

    if (!name) {
      return json<ActionData>({ profileError: "Name is required." }, { status: 400 });
    }

    try {
      await kdb.updateTable("users").set({
        name,
        phone,
        date_of_birth: dateOfBirth,
        nationality,
        residency_status: residency,
        emergency_contact_name: emergencyContactName,
        emergency_contact_phone: emergencyContactPhone,
        id_document_type: idDocumentType,
        id_document_number: idDocumentNumber,
        updated_at: new Date(),
      } as any).where("id", "=", Number(userId)).execute();
      return json<ActionData>({ profileSuccess: "Profile updated successfully." });
    } catch (err) {
      return json<ActionData>({ profileError: "Failed to update profile. Please try again." }, { status: 500 });
    }
  }

  if (intent === "change_password") {
    const currentPassword = formData.get("current_password")?.toString() || "";
    const newPassword = formData.get("new_password")?.toString() || "";
    const confirmPassword = formData.get("confirm_password")?.toString() || "";

    if (!currentPassword || !newPassword || !confirmPassword) {
      return json<ActionData>({ passwordError: "All password fields are required." }, { status: 400 });
    }

    if (newPassword.length < 8) {
      return json<ActionData>({ passwordError: "New password must be at least 8 characters." }, { status: 400 });
    }

    if (newPassword !== confirmPassword) {
      return json<ActionData>({ passwordError: "New passwords do not match." }, { status: 400 });
    }

    // Verify current password
    const user = (await kdb.selectFrom("users").select("password").where("id", "=", Number(userId)).execute())[0] ?? null;

    if (!user) {
      return json<ActionData>({ passwordError: "User not found." }, { status: 404 });
    }

    const isValid = await verifyPassword(currentPassword, user.password);
    if (!isValid) {
      return json<ActionData>({ passwordError: "Current password is incorrect." }, { status: 400 });
    }

    try {
      const hashedPassword = await hashPassword(newPassword);
      await kdb.updateTable("users").set({
        password: hashedPassword,
        updated_at: new Date(),
      } as any).where("id", "=", Number(userId)).execute();
      return json<ActionData>({ passwordSuccess: "Password changed successfully." });
    } catch (err) {
      return json<ActionData>({ passwordError: "Failed to change password. Please try again." }, { status: 500 });
    }
  }

  return json<ActionData>({ profileError: "Invalid action." }, { status: 400 });
}

export default function Profile() {
  const { user, upcomingBookings } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const [dateOfBirth, setDateOfBirth] = useState(user.date_of_birth ?? "");

  return (
    <div className="max-w-3xl mx-auto space-y-8">
      <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">My Profile</h1>

      {/* Profile Information */}
      <div className="p-6 bg-white dark:bg-slate-800 rounded-lg shadow-sm dark:shadow-slate-900/20 border border-slate-200 dark:border-slate-700 dark:border-slate-700">
        <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">Profile Information</h2>
        {actionData?.profileSuccess && (
          <p className="mt-2 text-sm text-green-600">{actionData.profileSuccess}</p>
        )}
        {actionData?.profileError && (
          <p className="mt-2 text-sm text-red-600">{actionData.profileError}</p>
        )}
        <Form method="post" className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <input type="hidden" name="intent" value="update_profile" />

          <div>
            <label htmlFor="name" className="block text-sm font-medium text-slate-700 dark:text-slate-200">Full Name</label>
            <input
              type="text"
              id="name"
              name="name"
              defaultValue={user.name}
              required
              className="mt-1 block w-full rounded-md border border-slate-300 dark:border-slate-600 dark:border-slate-600 px-3 py-2 text-sm shadow-sm dark:shadow-slate-900/20 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <div>
            <label htmlFor="email" className="block text-sm font-medium text-slate-700 dark:text-slate-200">Email</label>
            <input
              type="email"
              id="email"
              value={user.email}
              readOnly
              className="mt-1 block w-full rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-700 px-3 py-2 text-sm text-slate-500 dark:text-slate-400 cursor-not-allowed"
            />
          </div>

          <div>
            <label htmlFor="phone" className="block text-sm font-medium text-slate-700 dark:text-slate-200">Phone</label>
            <input
              type="tel"
              id="phone"
              name="phone"
              defaultValue={user.phone ?? ""}
              className="mt-1 block w-full rounded-md border border-slate-300 dark:border-slate-600 dark:border-slate-600 px-3 py-2 text-sm shadow-sm dark:shadow-slate-900/20 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <div>
            <span className="block text-sm font-medium text-slate-700 dark:text-slate-200">Date of Birth</span>
            <DOBPicker
              value={dateOfBirth}
              onChange={setDateOfBirth}
            />
            <input type="hidden" name="date_of_birth" value={dateOfBirth} />
          </div>

          <div>
            <label htmlFor="nationality" className="block text-sm font-medium text-slate-700 dark:text-slate-200">Nationality</label>
            <input
              type="text"
              id="nationality"
              name="nationality"
              defaultValue={user.nationality ?? ""}
              className="mt-1 block w-full rounded-md border border-slate-300 dark:border-slate-600 dark:border-slate-600 px-3 py-2 text-sm shadow-sm dark:shadow-slate-900/20 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <div>
            <label htmlFor="residency_status" className="block text-sm font-medium text-slate-700 dark:text-slate-200">Residency Status</label>
            <select
              id="residency_status"
              name="residency_status"
              defaultValue={user.residency_status ?? ""}
              className="mt-1 block w-full rounded-md border border-slate-300 dark:border-slate-600 dark:border-slate-600 px-3 py-2 text-sm shadow-sm dark:shadow-slate-900/20 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="">Select...</option>
              <option value="resident">Resident</option>
              <option value="tourist">Tourist</option>
            </select>
          </div>

          <div>
            <label htmlFor="id_document_type" className="block text-sm font-medium text-slate-700 dark:text-slate-200">ID Document Type</label>
            <select
              id="id_document_type"
              name="id_document_type"
              defaultValue={user.id_document_type ?? ""}
              className="mt-1 block w-full rounded-md border border-slate-300 dark:border-slate-600 dark:border-slate-600 px-3 py-2 text-sm shadow-sm dark:shadow-slate-900/20 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="">Select...</option>
              <option value="passport">Passport</option>
              <option value="national_id">National ID</option>
              <option value="drivers_license">Driver&#39;s License</option>
            </select>
          </div>

          <div>
            <label htmlFor="id_document_number" className="block text-sm font-medium text-slate-700 dark:text-slate-200">ID Document Number</label>
            <input
              type="text"
              id="id_document_number"
              name="id_document_number"
              defaultValue={user.id_document_number ?? ""}
              className="mt-1 block w-full rounded-md border border-slate-300 dark:border-slate-600 dark:border-slate-600 px-3 py-2 text-sm shadow-sm dark:shadow-slate-900/20 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <div className="sm:col-span-2">
            <button
              type="submit"
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              Save Profile
            </button>
          </div>
        </Form>
      </div>

      {/* Emergency Contact */}
      <div className="p-6 bg-white dark:bg-slate-800 rounded-lg shadow-sm dark:shadow-slate-900/20 border border-slate-200 dark:border-slate-700 dark:border-slate-700">
        <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">Emergency Contact</h2>
        <Form method="post" className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <input type="hidden" name="intent" value="update_profile" />

          <div>
            <label htmlFor="emergency_contact_name" className="block text-sm font-medium text-slate-700 dark:text-slate-200">Contact Name</label>
            <input
              type="text"
              id="emergency_contact_name"
              name="emergency_contact_name"
              defaultValue={user.emergency_contact_name ?? ""}
              className="mt-1 block w-full rounded-md border border-slate-300 dark:border-slate-600 dark:border-slate-600 px-3 py-2 text-sm shadow-sm dark:shadow-slate-900/20 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <div>
            <label htmlFor="emergency_contact_phone" className="block text-sm font-medium text-slate-700 dark:text-slate-200">Contact Phone</label>
            <input
              type="tel"
              id="emergency_contact_phone"
              name="emergency_contact_phone"
              defaultValue={user.emergency_contact_phone ?? ""}
              className="mt-1 block w-full rounded-md border border-slate-300 dark:border-slate-600 dark:border-slate-600 px-3 py-2 text-sm shadow-sm dark:shadow-slate-900/20 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <div className="sm:col-span-2">
            <button
              type="submit"
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              Save Emergency Contact
            </button>
          </div>
        </Form>
      </div>

      {/* Change Password */}
      <div className="p-6 bg-white dark:bg-slate-800 rounded-lg shadow-sm dark:shadow-slate-900/20 border border-slate-200 dark:border-slate-700 dark:border-slate-700">
        <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">Change Password</h2>
        {actionData?.passwordSuccess && (
          <p className="mt-2 text-sm text-green-600">{actionData.passwordSuccess}</p>
        )}
        {actionData?.passwordError && (
          <p className="mt-2 text-sm text-red-600">{actionData.passwordError}</p>
        )}
        <Form method="post" className="mt-4 space-y-4">
          <input type="hidden" name="intent" value="change_password" />

          <div>
            <label htmlFor="current_password" className="block text-sm font-medium text-slate-700 dark:text-slate-200">Current Password</label>
            <input
              type="password"
              id="current_password"
              name="current_password"
              required
              className="mt-1 block w-full max-w-sm rounded-md border border-slate-300 dark:border-slate-600 dark:border-slate-600 px-3 py-2 text-sm shadow-sm dark:shadow-slate-900/20 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <div>
            <label htmlFor="new_password" className="block text-sm font-medium text-slate-700 dark:text-slate-200">New Password</label>
            <input
              type="password"
              id="new_password"
              name="new_password"
              required
              minLength={8}
              className="mt-1 block w-full max-w-sm rounded-md border border-slate-300 dark:border-slate-600 dark:border-slate-600 px-3 py-2 text-sm shadow-sm dark:shadow-slate-900/20 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <div>
            <label htmlFor="confirm_password" className="block text-sm font-medium text-slate-700 dark:text-slate-200">Confirm New Password</label>
            <input
              type="password"
              id="confirm_password"
              name="confirm_password"
              required
              minLength={8}
              className="mt-1 block w-full max-w-sm rounded-md border border-slate-300 dark:border-slate-600 dark:border-slate-600 px-3 py-2 text-sm shadow-sm dark:shadow-slate-900/20 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <button
            type="submit"
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            Change Password
          </button>
        </Form>
      </div>

      {/* Upcoming Bookings */}
      <div className="p-6 bg-white dark:bg-slate-800 rounded-lg shadow-sm dark:shadow-slate-900/20 border border-slate-200 dark:border-slate-700 dark:border-slate-700">
        <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">Upcoming Bookings</h2>
        {upcomingBookings.length === 0 ? (
          <p className="mt-4 text-sm text-slate-500 dark:text-slate-400 dark:text-slate-500">No upcoming bookings found.</p>
        ) : (
          <div className="mt-4 space-y-3">
            {upcomingBookings.map(({ booking, firstLeg }) => (
              <div
                key={booking.id}
                className="p-4 border border-slate-200 dark:border-slate-700 rounded-md"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-slate-900 dark:text-slate-100">
                      {booking.booking_reference}
                    </p>
                    <p className="text-sm text-slate-500 dark:text-slate-400 dark:text-slate-500">
                      Status: {booking.status}
                    </p>
                    {firstLeg && (
                      <p className="text-sm text-slate-500 dark:text-slate-400 dark:text-slate-500">
                        {firstLeg.origin_code} &rarr; {firstLeg.destination_code}
                        {firstLeg.leg_date && ` | ${firstLeg.leg_date}`}
                      </p>
                    )}
                  </div>
                  <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                    booking.payment_status === "paid"
                      ? "bg-green-100 text-green-800"
                      : booking.payment_status === "refunded"
                      ? "bg-red-100 text-red-800"
                      : "bg-yellow-100 text-yellow-800"
                  }`}>
                    {booking.payment_status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}



export function ErrorBoundary() {
  const error = useRouteError();
  if (isRouteErrorResponse(error)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 dark:bg-slate-700 dark:bg-slate-900">
        <div className="mx-auto max-w-lg text-center px-4">
          <div className="mb-4 text-5xl font-bold text-slate-300 dark:text-slate-500 dark:text-slate-600 dark:text-slate-300 dark:text-slate-500">{error.status}</div>
          <h1 className="mb-2 text-xl font-semibold text-slate-900 dark:text-slate-100">Something went wrong</h1>
          <p className="mb-6 text-sm text-slate-500 dark:text-slate-400 dark:text-slate-500">{error.statusText}</p>
          <button onClick={() => window.location.reload()} className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">Try Again</button>
        </div>
      </div>
    );
  }
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 dark:bg-slate-700 dark:bg-slate-900">
      <div className="mx-auto max-w-lg text-center px-4">
        <h1 className="mb-2 text-xl font-semibold text-slate-900 dark:text-slate-100">Unexpected Error</h1>
        <p className="mb-6 text-sm text-slate-500 dark:text-slate-400 dark:text-slate-500">An unexpected error occurred. Please try again.</p>
        <button onClick={() => window.location.reload()} className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">Try Again</button>
      </div>
    </div>
  );
}

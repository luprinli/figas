import type { LoaderFunctionArgs, ActionFunctionArgs, MetaFunction } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useFetcher } from "@remix-run/react";

import { requirePermission } from "../utils/permissions.server";
import { Permission } from "../utils/constants";
import { kdb } from "../utils/db.server.kysely";
import { sql } from "kysely";
import { requireUser } from "../utils/layout.server";
import { hashPassword, verifyPassword } from "../utils/password.server";

export const meta: MetaFunction = () => [{ title: "Profile - FIGAS Fueler" }];

export async function loader({ request }: LoaderFunctionArgs) {
    const user = await requirePermission(request, Permission.FLIGHT_FUEL_EXECUTE);

    const profile = await sql<Record<string, unknown>>`
        SELECT name, email, phone, nationality, residency_status,
               emergency_contact_name, emergency_contact_phone, city
        FROM users WHERE id = ${Number(user.id)}
    `.execute(kdb);

    if (profile.rows.length === 0) {
        throw new Response("User not found", { status: 404 });
    }

    const p = profile.rows[0];

    let recentOrders: Record<string, unknown>[] = [];
    let stats = { totalOrders: 0, completedOrders: 0, totalKgLifted: 0 };
    try {
        const [rOrders, sRows] = await Promise.all([
            sql<Record<string, unknown>>`
                SELECT fo.id, fo.status, fo.requested_fuel_kg, fo.fueler_actual_uplift_kg,
                       fo.fueler_confirmed_at, f.flight_number
                FROM fuel_orders fo
                JOIN flights f ON f.id = fo.flight_id
                WHERE fo.fueler_confirmed_by = ${Number(user.id)} OR fo.status = 'completed'
                ORDER BY fo.fueler_confirmed_at DESC NULLS LAST
                LIMIT 20
            `.execute(kdb),
            sql<Record<string, unknown>>`
                SELECT
                    COUNT(*)::int AS total_orders,
                    COUNT(CASE WHEN status = 'completed' THEN 1 END)::int AS completed_orders,
                    COALESCE(SUM(CASE WHEN status = 'completed' THEN fueler_actual_uplift_kg ELSE 0 END), 0) AS total_kg_lifted
                FROM fuel_orders
            `.execute(kdb),
        ]);
        recentOrders = rOrders.rows;
        const s = sRows.rows[0];
        stats = {
            totalOrders: Number(s?.total_orders ?? 0),
            completedOrders: Number(s?.completed_orders ?? 0),
            totalKgLifted: Number(s?.total_kg_lifted ?? 0),
        };
    } catch {
        recentOrders = [];
        stats = { totalOrders: 0, completedOrders: 0, totalKgLifted: 0 };
    }

    return json({
        name: String(p.name ?? ""),
        email: String(p.email ?? ""),
        phone: p.phone != null ? String(p.phone) : "",
        city: p.city != null ? String(p.city) : "",
        nationality: p.nationality != null ? String(p.nationality) : "",
        residencyStatus: p.residency_status != null ? String(p.residency_status) : "",
        emergencyContactName: p.emergency_contact_name != null ? String(p.emergency_contact_name) : "",
        emergencyContactPhone: p.emergency_contact_phone != null ? String(p.emergency_contact_phone) : "",
        recentOrders,
        stats,
    });
}

export async function action({ request }: ActionFunctionArgs) {
    const { userId } = await requireUser(request);

    const formData = await request.formData();
    const intent = formData.get("intent")?.toString();

    if (intent === "update-profile") {
        const name = formData.get("name")?.toString() ?? "";
        const phone = formData.get("phone")?.toString() ?? "";
        const city = formData.get("city")?.toString() ?? "";
        const nationality = formData.get("nationality")?.toString() ?? "";
        const emergencyContactName = formData.get("emergencyContactName")?.toString() ?? "";
        const emergencyContactPhone = formData.get("emergencyContactPhone")?.toString() ?? "";

        await sql`
            UPDATE users SET
                name = ${name}, phone = ${phone || null}, city = ${city || null},
                nationality = ${nationality || null},
                emergency_contact_name = ${emergencyContactName || null},
                emergency_contact_phone = ${emergencyContactPhone || null},
                updated_at = NOW()
            WHERE id = ${Number(userId)}
        `.execute(kdb);

        return json({ success: true, message: "Profile updated" });
    }

    if (intent === "change-password") {
        const currentPassword = formData.get("currentPassword")?.toString() ?? "";
        const newPassword = formData.get("newPassword")?.toString() ?? "";
        const confirmPassword = formData.get("confirmPassword")?.toString() ?? "";

        if (newPassword !== confirmPassword) {
            return json({ error: "New passwords do not match" }, { status: 400 });
        }
        if (newPassword.length < 8) {
            return json({ error: "Password must be at least 8 characters" }, { status: 400 });
        }

        const user = await sql<{ password: string }>`
            SELECT password FROM users WHERE id = ${Number(userId)}
        `.execute(kdb);

        if (user.rows.length === 0) {
            return json({ error: "User not found" }, { status: 404 });
        }

        const valid = await verifyPassword(currentPassword, user.rows[0].password);
        if (!valid) {
            return json({ error: "Current password is incorrect" }, { status: 400 });
        }

        const hashed = await hashPassword(newPassword);
        await sql`
            UPDATE users SET password = ${hashed}, updated_at = NOW()
            WHERE id = ${Number(userId)}
        `.execute(kdb);

        return json({ success: true, message: "Password changed" });
    }

    return json({ error: "Unknown intent" }, { status: 400 });
}

export default function FuelerProfile() {
    const data = useLoaderData<typeof loader>();
    const profileFetcher = useFetcher<{ success?: boolean; error?: string; message?: string }>();
    const passwordFetcher = useFetcher<{ success?: boolean; error?: string; message?: string }>();

    return (
        <div className="p-6 space-y-6 max-w-3xl">
            <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Fueler Profile</h1>

            {profileFetcher.data?.success && (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 dark:bg-emerald-900/10 dark:border-emerald-800 p-3">
                    <p className="text-sm text-emerald-600 dark:text-emerald-400">{profileFetcher.data.message}</p>
                </div>
            )}
            {profileFetcher.data?.error && (
                <div className="rounded-lg border border-red-200 bg-red-50 dark:bg-red-900/10 dark:border-red-800 p-3">
                    <p className="text-sm text-red-600 dark:text-red-400">{profileFetcher.data.error}</p>
                </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4">
                    <p className="text-xs text-slate-500 dark:text-slate-400">Total Orders</p>
                    <p className="text-2xl font-bold text-slate-800 dark:text-slate-100 tabular-nums">{data.stats.totalOrders}</p>
                </div>
                <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4">
                    <p className="text-xs text-slate-500 dark:text-slate-400">Completed</p>
                    <p className="text-2xl font-bold text-slate-800 dark:text-slate-100 tabular-nums">{data.stats.completedOrders}</p>
                </div>
                <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4">
                    <p className="text-xs text-slate-500 dark:text-slate-400">Total Lifted</p>
                    <p className="text-2xl font-bold text-slate-800 dark:text-slate-100 tabular-nums">{data.stats.totalKgLifted} kg</p>
                </div>
            </div>

            <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-6">
                <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100 mb-4">Personal Information</h2>
                <profileFetcher.Form method="post" className="space-y-4">
                    <input type="hidden" name="intent" value="update-profile" />
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                            <label htmlFor="fueler-name" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Name</label>
                            <input id="fueler-name" type="text" name="name" defaultValue={data.name}
                                className="w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-3 py-2 text-sm text-slate-800 dark:text-slate-100" />
                        </div>
                        <div>
                            <label htmlFor="fueler-email" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Email</label>
                            <input id="fueler-email" type="email" value={data.email} disabled
                                className="w-full rounded-md border border-slate-200 dark:border-slate-600 bg-slate-100 dark:bg-slate-600 px-3 py-2 text-sm text-slate-500 dark:text-slate-400" />
                        </div>
                        <div>
                            <label htmlFor="fueler-phone" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Phone</label>
                            <input id="fueler-phone" type="text" name="phone" defaultValue={data.phone}
                                className="w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-3 py-2 text-sm text-slate-800 dark:text-slate-100" />
                        </div>
                        <div>
                            <label htmlFor="fueler-city" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">City</label>
                            <input id="fueler-city" type="text" name="city" defaultValue={data.city}
                                className="w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-3 py-2 text-sm text-slate-800 dark:text-slate-100" />
                        </div>
                        <div>
                            <label htmlFor="fueler-nationality" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Nationality</label>
                            <input id="fueler-nationality" type="text" name="nationality" defaultValue={data.nationality}
                                className="w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-3 py-2 text-sm text-slate-800 dark:text-slate-100" />
                        </div>
                    </div>

                    <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 pt-2">Emergency Contact</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                            <label htmlFor="fueler-emergency-name" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Name</label>
                            <input id="fueler-emergency-name" type="text" name="emergencyContactName" defaultValue={data.emergencyContactName}
                                className="w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-3 py-2 text-sm text-slate-800 dark:text-slate-100" />
                        </div>
                        <div>
                            <label htmlFor="fueler-emergency-phone" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Phone</label>
                            <input id="fueler-emergency-phone" type="text" name="emergencyContactPhone" defaultValue={data.emergencyContactPhone}
                                className="w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-3 py-2 text-sm text-slate-800 dark:text-slate-100" />
                        </div>
                    </div>

                    <button type="submit" className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-hover">
                        Save Changes
                    </button>
                </profileFetcher.Form>
            </div>

            <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-6">
                <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100 mb-4">Change Password</h2>
                {passwordFetcher.data?.success && (
                    <div className="rounded-lg border border-emerald-200 bg-emerald-50 dark:bg-emerald-900/10 mb-3 p-2">
                        <p className="text-sm text-emerald-600 dark:text-emerald-400">{passwordFetcher.data.message}</p>
                    </div>
                )}
                <passwordFetcher.Form method="post" className="space-y-3 max-w-sm">
                    <input type="hidden" name="intent" value="change-password" />
                    <div>
                        <label htmlFor="fueler-current-pw" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Current Password</label>
                        <input id="fueler-current-pw" type="password" name="currentPassword" required
                            className="w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-3 py-2 text-sm text-slate-800 dark:text-slate-100" />
                    </div>
                    <div>
                        <label htmlFor="fueler-new-pw" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">New Password</label>
                        <input id="fueler-new-pw" type="password" name="newPassword" required minLength={8}
                            className="w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-3 py-2 text-sm text-slate-800 dark:text-slate-100" />
                    </div>
                    <div>
                        <label htmlFor="fueler-confirm-pw" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Confirm New Password</label>
                        <input id="fueler-confirm-pw" type="password" name="confirmPassword" required minLength={8}
                            className="w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-3 py-2 text-sm text-slate-800 dark:text-slate-100" />
                    </div>
                    <button type="submit" className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-hover">
                        Change Password
                    </button>
                </passwordFetcher.Form>
            </div>

            <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-6">
                <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100 mb-4">Recent Fuel Orders</h2>
                <div className="overflow-x-auto">
                    <table className="min-w-full text-sm">
                        <thead>
                            <tr className="border-b border-slate-200 dark:border-slate-700 text-left text-slate-500 dark:text-slate-400">
                                <th className="py-2 pr-3 font-medium">Flight</th>
                                <th className="py-2 pr-3 font-medium">Requested</th>
                                <th className="py-2 pr-3 font-medium">Actual</th>
                                <th className="py-2 font-medium">Status</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                            {(data.recentOrders as Array<Record<string, unknown>>).map((o, i) => (
                                <tr key={i}>
                                    <td className="py-2 pr-3 text-slate-800 dark:text-slate-200">{o.flight_number as string}</td>
                                    <td className="py-2 pr-3 text-slate-600 dark:text-slate-400 tabular-nums">{o.requested_fuel_kg as number} kg</td>
                                    <td className="py-2 pr-3 text-slate-600 dark:text-slate-400 tabular-nums">{o.fueler_actual_uplift_kg != null ? `${o.fueler_actual_uplift_kg} kg` : "—"}</td>
                                    <td className="py-2">
                                        <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                                            o.status === "completed" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" :
                                            o.status === "issued" ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" :
                                            "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300"
                                        }`}>
                                            {o.status as string}
                                        </span>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}

export function ErrorBoundary() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-center">
        <h1 className="text-2xl font-bold text-red-600">Something went wrong</h1>
        <p className="mt-2 text-gray-600">An unexpected error occurred. Please try again.</p>
      </div>
    </div>
  );
}

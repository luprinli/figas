import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { requireAuth } from "../utils/auth.server";
import SidebarLayout from "../components/SidebarLayout";

export async function loader({ request }: LoaderFunctionArgs) {
  await requireAuth(request);
  return json({});
}

export default function Settings() {
  const navItems = [
    { to: "/finance/settings", label: "Finance Settings" },
    { to: "/admin/settings", label: "System Settings" },
  ];

  return (
    <SidebarLayout title="Settings" userIdentity={null} navItems={navItems} />
  );
}

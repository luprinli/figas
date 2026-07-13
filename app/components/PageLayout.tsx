import { Outlet } from "@remix-run/react";

type Props = {
  title: string;
  userIdentity?: { name: string; email: string } | null;
  headerActions?: React.ReactNode;
  subNav?: React.ReactNode;
  children?: React.ReactNode;
};

export default function PageLayout({ title, headerActions, subNav, children }: Props) {
  return (
    <main className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">{title}</h1>
        {headerActions && (
          <div className="flex items-center gap-4">{headerActions}</div>
        )}
      </div>
      {subNav}
      {children}
      <Outlet />
    </main>
  );
}

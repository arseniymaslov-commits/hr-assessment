"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, ClipboardCheck, Grid3X3, LineChart, Settings, Users } from "lucide-react";

const icons = {
  dashboard: BarChart3,
  matrix: Grid3X3,
  analytics: LineChart,
  evaluations: ClipboardCheck,
  completion: Users,
  admin: Settings
};

type AppNavLinkProps = {
  href: string;
  label: string;
  icon: keyof typeof icons;
};

export default function AppNavLink({ href, label, icon }: AppNavLinkProps) {
  const pathname = usePathname();
  const Icon = icons[icon];
  const isActive = pathname === href || pathname.startsWith(`${href}/`);

  return (
    <Link
      className={`focus-ring group relative inline-flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-200 hover:-translate-y-0.5 ${
        isActive
          ? "bg-brand/5 text-brand"
          : "text-slate-700 hover:bg-slate-100 hover:text-ink"
      }`}
      href={href}
    >
      <Icon className="transition-transform duration-200 group-hover:scale-110" size={16} />
      {label}
      {isActive ? <span className="animate-soft-in absolute inset-x-3 -bottom-2 h-0.5 rounded-full bg-brand" /> : null}
    </Link>
  );
}

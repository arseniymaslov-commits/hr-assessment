import Image from "next/image";
import Link from "next/link";
import { BarChart3, ClipboardCheck, Grid3X3, LineChart, Settings, Users, type LucideIcon } from "lucide-react";
import { Role } from "@prisma/client";
import { roleLabel } from "@/lib/auth";

const nav: { href: string; label: string; icon: LucideIcon; roles: Role[] }[] = [
  {
    href: "/dashboard",
    label: "Дашборд",
    icon: BarChart3,
    roles: [Role.ADMIN, Role.ANALYST, Role.LEADER, Role.DIRECTOR, Role.VIEWER, Role.DASHBOARD_VIEWER]
  },
  {
    href: "/matrix",
    label: "Матрица",
    icon: Grid3X3,
    roles: [Role.ADMIN, Role.ANALYST, Role.LEADER, Role.DIRECTOR, Role.VIEWER]
  },
  {
    href: "/analytics",
    label: "Аналитика HRD",
    icon: LineChart,
    roles: [Role.ADMIN, Role.ANALYST, Role.DIRECTOR]
  },
  {
    href: "/evaluations",
    label: "Оценки",
    icon: ClipboardCheck,
    roles: [Role.ADMIN, Role.LEADER, Role.DIRECTOR]
  },
  {
    href: "/completion",
    label: "Заполнение",
    icon: Users,
    roles: [Role.ADMIN, Role.ANALYST, Role.LEADER, Role.DIRECTOR, Role.VIEWER]
  },
  { href: "/admin", label: "Админка", icon: Settings, roles: [Role.ADMIN] }
];

type AppShellProps = {
  user: {
    name: string;
    email: string;
    role: Role;
    position?: string | null;
    department?: { name: string } | null;
  };
  children: React.ReactNode;
};

export default function AppShell({ user, children }: AppShellProps) {
  return (
    <div className="min-h-screen bg-surface">
      <header className="sticky top-0 z-20 border-b border-line bg-white/95 backdrop-blur">
        <div className="mx-auto max-w-7xl px-4">
          <div className="flex min-w-0 items-center justify-between gap-4 py-3">
            <div className="flex min-w-0 items-center gap-4">
              <div className="relative h-11 w-44 shrink-0 overflow-hidden">
              <Image src="/rp-logo.png" alt="Red Petroleum" fill className="object-contain object-left" priority />
              </div>
              <div className="min-w-0 border-l border-line pl-4">
                <div className="font-semibold text-ink">Оценка взаимодействия</div>
                <div className="truncate text-sm text-muted">
                  {user.name} · {roleLabel(user.role)}
                  {user.position ? ` · ${user.position}` : ""}
                  {user.department ? ` · ${user.department.name}` : ""}
                </div>
              </div>
            </div>
            <form action="/logout" method="post">
              <button className="focus-ring rounded-lg border border-brand/35 bg-white px-3 py-2 text-sm font-semibold text-brand transition hover:border-brand hover:bg-brand/5">
                Выйти
              </button>
            </form>
          </div>

          <nav className="flex gap-1 overflow-x-auto border-t border-line py-2">
            {nav
              .filter((item) => item.roles.includes(user.role))
              .map((item) => {
                const Icon = item.icon;
                return (
                  <Link
                    className="focus-ring inline-flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100 hover:text-ink"
                    href={item.href}
                    key={item.href}
                  >
                    <Icon size={16} />
                    {item.label}
                  </Link>
                );
              })}
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6">{children}</main>
    </div>
  );
}

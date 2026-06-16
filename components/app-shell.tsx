import Image from "next/image";
import Link from "next/link";
import { BarChart3, ClipboardCheck, Grid3X3, Settings, Users, type LucideIcon } from "lucide-react";
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
      <header className="sticky top-0 z-20 border-b border-line bg-white/95 shadow-sm backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg border border-red-100 bg-white p-1.5 shadow-sm">
              <Image src="/rp-logo.svg" alt="Red Petroleum" width={38} height={38} priority />
            </div>
            <div>
              <div className="font-semibold text-ink">Оценка взаимодействия</div>
              <div className="text-sm text-muted">
                {user.name} · {roleLabel(user.role)}
                {user.position ? ` · ${user.position}` : ""}
                {user.department ? ` · ${user.department.name}` : ""}
              </div>
            </div>
          </div>
          <nav className="flex flex-wrap items-center gap-2">
            {nav
              .filter((item) => item.roles.includes(user.role))
              .map((item) => {
                const Icon = item.icon;
                return (
                  <Link
                    className="focus-ring inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-slate-700 hover:bg-red-50 hover:text-brand"
                    href={item.href}
                    key={item.href}
                  >
                    <Icon size={16} />
                    {item.label}
                  </Link>
                );
              })}
            <form action="/logout" method="post">
              <button className="focus-ring rounded-lg border border-line px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
                Выйти
              </button>
            </form>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6">{children}</main>
    </div>
  );
}

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  BarChart3,
  Building2,
  FileText,
  LayoutTemplate,
  ListChecks,
  MapPin,
  MoreHorizontal,
  Settings,
  Shapes,
  Table2,
  Users,
  type LucideIcon,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { isActive, type NavIcon, type NavSection } from "./nav-items";

const ICONS: Record<NavIcon, LucideIcon> = {
  forms: FileText,
  templates: LayoutTemplate,
  overview: BarChart3,
  registry: Table2,
  people: Users,
  departments: Building2,
  chapters: MapPin,
  categories: Shapes,
  adminTemplates: ListChecks,
  settings: Settings,
};

export function SidebarNav({ sections }: { sections: NavSection[] }) {
  const t = useTranslations("nav");
  const pathname = usePathname();

  return (
    <nav aria-label={t("main")} className="space-y-6">
      {sections.map((section, i) => (
        <div key={i}>
          {section.titleKey && (
            <p className="mb-2 px-3 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              {t(section.titleKey)}
            </p>
          )}
          <ul className="space-y-0.5">
            {section.items.map((item) => {
              const Icon = ICONS[item.icon];
              const active = isActive(pathname, item.href);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                      active
                        ? "bg-brand-soft text-foreground"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground",
                    )}
                  >
                    <Icon className={cn("size-4", active && "text-brand")} aria-hidden />
                    {t(item.label)}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

export function BottomNav({ sections }: { sections: NavSection[] }) {
  const t = useTranslations("nav");
  const pathname = usePathname();
  const items = sections.flatMap((s) => s.items);
  const primary = items.filter((i) => i.primary);
  const overflow = items.filter((i) => !i.primary);
  const overflowActive = overflow.some((i) => isActive(pathname, i.href));

  const tabClass = (active: boolean) =>
    cn(
      "flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 px-1 text-[11px] font-medium",
      active ? "text-brand" : "text-muted-foreground",
    );

  return (
    <nav
      aria-label={t("main")}
      className="fixed inset-x-0 bottom-0 z-40 flex border-t bg-card pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      {primary.map((item) => {
        const Icon = ICONS[item.icon];
        const active = isActive(pathname, item.href);
        return (
          <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined} className={tabClass(active)}>
            <Icon className="size-5" aria-hidden />
            <span className="truncate">{t(item.label)}</span>
          </Link>
        );
      })}
      {overflow.length > 0 && (
        <DropdownMenu>
          <DropdownMenuTrigger className={tabClass(overflowActive)}>
            <MoreHorizontal className="size-5" aria-hidden />
            <span>{t("more")}</span>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="top" align="end" className="w-56">
            {overflow.map((item) => {
              const Icon = ICONS[item.icon];
              return (
                <DropdownMenuItem key={item.href} asChild>
                  <Link href={item.href}>
                    <Icon aria-hidden />
                    {t(item.label)}
                  </Link>
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </nav>
  );
}

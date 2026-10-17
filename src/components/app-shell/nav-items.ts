import type { Database } from "@/lib/database.types";

type Role = Database["public"]["Enums"]["user_role"];

export type NavIcon =
  | "forms"
  | "templates"
  | "overview"
  | "registry"
  | "people"
  | "departments"
  | "chapters"
  | "categories"
  | "adminTemplates"
  | "settings";

export type NavItem = {
  href: string;
  /** Key in the `nav` message namespace. */
  label: string;
  icon: NavIcon;
  /** Shown in the mobile bottom bar (others go under "More"). */
  primary?: boolean;
};

export type NavSection = { titleKey?: string; items: NavItem[] };

/** Navigation is derived from the role. The server still checks every route. */
export function navFor(role: Role): NavSection[] {
  if (role !== "superadmin") {
    return [
      {
        items: [
          { href: "/dashboard", label: "myForms", icon: "forms", primary: true },
          { href: "/templates", label: "templates", icon: "templates", primary: true },
        ],
      },
    ];
  }

  // Superadmins land on /admin (/dashboard redirects there); their own forms are in the registry.
  return [
    {
      titleKey: "secretary",
      items: [
        { href: "/admin", label: "overview", icon: "overview", primary: true },
        { href: "/admin/forms", label: "registry", icon: "registry", primary: true },
        { href: "/admin/people", label: "people", icon: "people", primary: true },
        { href: "/admin/departments", label: "departments", icon: "departments" },
        { href: "/admin/chapters", label: "chapters", icon: "chapters" },
        { href: "/admin/categories", label: "categories", icon: "categories" },
        { href: "/admin/templates", label: "adminTemplates", icon: "adminTemplates" },
        { href: "/admin/settings", label: "settings", icon: "settings" },
        { href: "/templates", label: "templates", icon: "templates" },
      ],
    },
  ];
}

export function isActive(pathname: string, href: string): boolean {
  if (href === "/admin" || href === "/dashboard") return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

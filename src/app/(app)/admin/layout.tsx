import { requireSuperadmin } from "@/lib/auth";

/** Every /admin route is superadmin-only; the check runs on the server for each request. */
export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  await requireSuperadmin();
  return children;
}

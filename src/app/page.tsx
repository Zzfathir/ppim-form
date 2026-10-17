import { redirect } from "next/navigation";
import { getCurrentProfile, needsOnboarding } from "@/lib/auth";

export default async function Home() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  if (needsOnboarding(profile)) redirect("/onboarding");
  redirect(profile.role === "superadmin" ? "/admin" : "/dashboard");
}

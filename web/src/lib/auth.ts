import "server-only";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type Role = "platform_admin" | "org_admin" | "member";

export type Profile = {
  id: string;
  email: string;
  name: string | null;
  role: Role;
  org_id: string | null;
  password_set: boolean;
  organizations: { name: string } | null;
};

/** Returns the signed-in user's profile or redirects to /login. */
export async function requireProfile(): Promise<Profile> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data } = await supabase
    .from("profiles")
    .select("id, email, name, role, org_id, password_set, organizations(name)")
    .eq("id", user.id)
    .single();
  if (!data) redirect("/login?error=no_profile");
  return data as unknown as Profile;
}

export async function requireRole(...roles: Role[]): Promise<Profile> {
  const profile = await requireProfile();
  if (!roles.includes(profile.role)) redirect("/dashboard");
  return profile;
}

export function siteUrl() {
  return process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
}

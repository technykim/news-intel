"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireRole, siteUrl, type Role } from "@/lib/auth";
import type { FormState } from "@/components/ActionForm";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function invite(email: string, name: string, orgId: string, role: Role): Promise<FormState> {
  const admin = createAdminClient();
  const { error } = await admin.auth.admin.inviteUserByEmail(email, {
    data: { org_id: orgId, role, name },
    redirectTo: `${siteUrl()}/auth/callback?next=/set-password`,
  });
  if (error) {
    if (/already/i.test(error.message)) return { error: "이미 등록된 이메일입니다." };
    return { error: `초대 실패: ${error.message}` };
  }
  return { ok: `${email} 로 초대 메일을 보냈습니다. 사용자가 링크에서 비밀번호를 설정합니다.` };
}

/** Platform admin: create a customer organization and invite its first admin. */
export async function createOrganization(_: FormState, formData: FormData): Promise<FormState> {
  await requireRole("platform_admin");
  const orgName = String(formData.get("org_name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const name = String(formData.get("name") ?? "").trim();
  if (!orgName) return { error: "고객사 이름을 입력해 주세요." };
  if (!EMAIL_RE.test(email)) return { error: "관리자 이메일 형식이 올바르지 않습니다." };

  const admin = createAdminClient();
  const { data: org, error } = await admin
    .from("organizations")
    .insert({ name: orgName })
    .select("id")
    .single();
  if (error || !org) return { error: `고객사 생성 실패: ${error?.message}` };

  const result = await invite(email, name, org.id, "org_admin");
  if (result?.error) {
    await admin.from("organizations").delete().eq("id", org.id);
    return result;
  }
  await admin.from("schedules").insert({ org_id: org.id, hour_kst: 8, send_email: true, active: true });
  revalidatePath("/admin");
  return { ok: `'${orgName}' 고객사를 만들었습니다. ${result?.ok}` };
}

export async function setOrganizationActive(orgId: string, active: boolean) {
  await requireRole("platform_admin");
  await createAdminClient().from("organizations").update({ active }).eq("id", orgId);
  revalidatePath("/admin");
}

/** Org admin: invite a user into their own organization. */
export async function inviteMember(_: FormState, formData: FormData): Promise<FormState> {
  const me = await requireRole("org_admin");
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const name = String(formData.get("name") ?? "").trim();
  const role = formData.get("role") === "org_admin" ? "org_admin" : "member";
  if (!EMAIL_RE.test(email)) return { error: "이메일 형식이 올바르지 않습니다." };
  if (!me.org_id) return { error: "소속 고객사가 없습니다." };

  const result = await invite(email, name, me.org_id, role);
  revalidatePath("/settings/users");
  return result;
}

/** Org admin: remove a user from their organization (cannot remove self). */
export async function removeMember(userId: string) {
  const me = await requireRole("org_admin");
  if (userId === me.id) return;
  const admin = createAdminClient();
  const { data: target } = await admin.from("profiles").select("org_id").eq("id", userId).single();
  if (!target || target.org_id !== me.org_id) return;
  await admin.auth.admin.deleteUser(userId);
  revalidatePath("/settings/users");
}

"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireProfile } from "@/lib/auth";
import type { FormState } from "@/components/ActionForm";

const VALID_STATUS = new Set(["new", "reviewing", "to_contact", "excluded"]);
const VALID_CONSENT = new Set(["unknown", "consented", "refused"]);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function updateTargetCompany(formData: FormData) {
  const me = await requireProfile();
  if (!me.org_id) return;

  const targetId = String(formData.get("target_id") ?? "");
  const entityId = String(formData.get("entity_id") ?? "");
  const status = String(formData.get("status") ?? "new");
  const memo = String(formData.get("memo") ?? "").trim();
  const homepage = String(formData.get("homepage") ?? "").trim();

  if (!targetId || !VALID_STATUS.has(status)) return;

  const supabase = await createClient();
  const { data: owned } = await supabase
    .from("target_companies")
    .update({ status, memo: memo || null })
    .eq("id", targetId)
    .eq("org_id", me.org_id)
    .select("entity_id")
    .single();

  if (owned && entityId && owned.entity_id === entityId) {
    const cleanUrl =
      homepage && (homepage.startsWith("http://") || homepage.startsWith("https://"))
        ? homepage
        : null;
    if (homepage === "" || cleanUrl) {
      await createAdminClient()
        .from("entities")
        .update({ homepage: cleanUrl })
        .eq("id", entityId);
    }
  }

  revalidatePath("/targets");
}

export async function addContact(_: FormState, formData: FormData): Promise<FormState> {
  const me = await requireProfile();
  if (!me.org_id) return { error: "소속 고객사가 없습니다." };

  const targetCompanyId = String(formData.get("target_company_id") ?? "").trim() || null;
  const name = String(formData.get("name") ?? "").trim() || null;
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const consent = String(formData.get("consent") ?? "unknown");
  const source = String(formData.get("source") ?? "").trim() || null;

  if (!EMAIL_RE.test(email)) return { error: "올바른 이메일 주소를 입력해 주세요." };
  if (!VALID_CONSENT.has(consent)) return { error: "동의 상태 값이 올바르지 않습니다." };

  const supabase = await createClient();
  const { error } = await supabase.from("contacts").insert({
    org_id: me.org_id,
    target_company_id: targetCompanyId,
    name,
    email,
    consent,
    source,
  });

  if (error) {
    if (error.code === "23505") return { error: `'${email}' 연락처는 이미 등록되어 있습니다.` };
    return { error: `등록 실패: ${error.message}` };
  }

  revalidatePath("/targets");
  revalidatePath("/campaigns");
  return { ok: `${email} 담당자를 등록했습니다.` };
}

export async function updateContactConsent(contactId: string, consent: string) {
  const me = await requireProfile();
  if (!me.org_id || !VALID_CONSENT.has(consent)) return;

  const supabase = await createClient();
  await supabase
    .from("contacts")
    .update({ consent })
    .eq("id", contactId)
    .eq("org_id", me.org_id);

  revalidatePath("/targets");
  revalidatePath("/campaigns");
}

export async function deleteContact(contactId: string) {
  const me = await requireProfile();
  if (!me.org_id) return;

  const supabase = await createClient();
  await supabase.from("contacts").delete().eq("id", contactId).eq("org_id", me.org_id);

  revalidatePath("/targets");
  revalidatePath("/campaigns");
}

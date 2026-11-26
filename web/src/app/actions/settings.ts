"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth";
import type { FormState } from "@/components/ActionForm";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function addKeyword(_: FormState, formData: FormData): Promise<FormState> {
  const me = await requireRole("org_admin");
  if (!me.org_id) return { error: "소속 고객사가 없습니다." };

  const keyword = String(formData.get("keyword") ?? "").trim();
  const category = String(formData.get("category") ?? "").trim() || "기타";
  if (!keyword) return { error: "키워드를 입력해 주세요." };

  const supabase = await createClient();
  const { error } = await supabase.from("keywords").insert({
    org_id: me.org_id,
    keyword,
    category,
    active: true,
  });

  if (error) {
    if (error.code === "23505") return { error: `'${keyword}' 키워드는 이미 등록되어 있습니다.` };
    return { error: `등록 실패: ${error.message}` };
  }

  revalidatePath("/settings/keywords");
  revalidatePath("/dashboard");
  return { ok: `'${keyword}' (${category}) 키워드를 추가했습니다.` };
}

export async function toggleKeyword(keywordId: string, active: boolean) {
  const me = await requireRole("org_admin");
  if (!me.org_id) return;

  const supabase = await createClient();
  await supabase
    .from("keywords")
    .update({ active })
    .eq("id", keywordId)
    .eq("org_id", me.org_id);

  revalidatePath("/settings/keywords");
  revalidatePath("/dashboard");
}

export async function deleteKeyword(keywordId: string) {
  const me = await requireRole("org_admin");
  if (!me.org_id) return;

  const supabase = await createClient();
  await supabase.from("keywords").delete().eq("id", keywordId).eq("org_id", me.org_id);

  revalidatePath("/settings/keywords");
  revalidatePath("/dashboard");
}

export async function addRecipients(_: FormState, formData: FormData): Promise<FormState> {
  const me = await requireRole("org_admin");
  if (!me.org_id) return { error: "소속 고객사가 없습니다." };

  const raw = String(formData.get("emails") ?? "");
  const parsed = Array.from(
    new Set(
      raw
        .replace(/;/g, ",")
        .split(/[\n,]+/)
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean)
    )
  );

  if (!parsed.length) return { error: "수신자 이메일을 입력해 주세요." };
  const invalid = parsed.filter((e) => !EMAIL_RE.test(e));
  if (invalid.length) {
    return { error: `이메일 형식이 올바르지 않습니다: ${invalid.join(", ")}` };
  }

  const supabase = await createClient();
  const rows = parsed.map((email) => ({ org_id: me.org_id!, email }));
  const { error } = await supabase
    .from("recipients")
    .upsert(rows, { onConflict: "org_id,email", ignoreDuplicates: true });

  if (error) return { error: `등록 실패: ${error.message}` };

  revalidatePath("/settings/recipients");
  revalidatePath("/dashboard");
  return { ok: `${parsed.length}건의 수신자를 저장했습니다.` };
}

export async function deleteRecipient(recipientId: string) {
  const me = await requireRole("org_admin");
  if (!me.org_id) return;

  const supabase = await createClient();
  await supabase.from("recipients").delete().eq("id", recipientId).eq("org_id", me.org_id);

  revalidatePath("/settings/recipients");
  revalidatePath("/dashboard");
}

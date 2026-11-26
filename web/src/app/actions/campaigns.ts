"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireProfile, requireRole, siteUrl } from "@/lib/auth";
import { sendResendEmail, signUnsubscribe } from "@/lib/resend";
import type { FormState } from "@/components/ActionForm";

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\n/g, "<br>");
}

export async function createCampaign(_: FormState, formData: FormData): Promise<FormState> {
  const me = await requireProfile();
  if (!me.org_id) return { error: "소속 고객사가 없습니다." };

  const subject = String(formData.get("subject") ?? "").trim();
  const bodyText = String(formData.get("body") ?? "").trim();
  const mode = formData.get("mode") === "pending_approval" ? "pending_approval" : "draft";

  if (!subject) return { error: "메일 제목을 입력해 주세요." };
  if (!bodyText) return { error: "메일 본문을 입력해 주세요." };

  const bodyHtml = `<div style="font-family:'Apple SD Gothic Neo','Malgun Gothic',sans-serif;line-height:1.7;color:#0f172a;">${escapeHtml(bodyText)}</div>`;

  const supabase = await createClient();
  const { error } = await supabase.from("campaigns").insert({
    org_id: me.org_id,
    subject,
    body_html: bodyHtml,
    status: mode,
    requested_by: me.id,
  });

  if (error) return { error: `캠페인 저장 실패: ${error.message}` };

  revalidatePath("/campaigns");
  return {
    ok:
      mode === "pending_approval"
        ? "캠페인을 저장하고 관리자에게 승인을 요청했습니다."
        : "캠페인 초안을 저장했습니다.",
  };
}

export async function submitForApproval(campaignId: string) {
  const me = await requireProfile();
  if (!me.org_id) return;

  const supabase = await createClient();
  await supabase
    .from("campaigns")
    .update({ status: "pending_approval" })
    .eq("id", campaignId)
    .eq("org_id", me.org_id)
    .in("status", ["draft", "rejected"]);

  revalidatePath("/campaigns");
}

export async function rejectCampaign(campaignId: string) {
  const me = await requireRole("org_admin");
  if (!me.org_id) return;

  const supabase = await createClient();
  await supabase
    .from("campaigns")
    .update({ status: "rejected", approved_by: me.id, approved_at: new Date().toISOString() })
    .eq("id", campaignId)
    .eq("org_id", me.org_id)
    .eq("status", "pending_approval");

  revalidatePath("/campaigns");
}

export async function deleteCampaign(campaignId: string) {
  const me = await requireProfile();
  if (!me.org_id) return;

  const supabase = await createClient();
  await supabase
    .from("campaigns")
    .delete()
    .eq("id", campaignId)
    .eq("org_id", me.org_id)
    .neq("status", "sent");

  revalidatePath("/campaigns");
}

/**
 * Org admin only: approves a pending campaign and sends it ONLY to contacts
 * with consent = 'consented' who are not in the org's unsubscribes table.
 */
export async function approveAndSendCampaign(campaignId: string) {
  const me = await requireRole("org_admin");
  if (!me.org_id) return;

  const admin = createAdminClient();
  const { data: campaign } = await admin
    .from("campaigns")
    .select("id, org_id, subject, body_html, status")
    .eq("id", campaignId)
    .eq("org_id", me.org_id)
    .single();

  if (!campaign || campaign.status !== "pending_approval") return;

  const [{ data: contacts }, { data: unsubs }] = await Promise.all([
    admin
      .from("contacts")
      .select("id, email")
      .eq("org_id", me.org_id)
      .eq("consent", "consented"),
    admin.from("unsubscribes").select("email").eq("org_id", me.org_id),
  ]);

  const unsubSet = new Set((unsubs ?? []).map((u) => u.email.toLowerCase()));
  const eligible = (contacts ?? []).filter((c) => !unsubSet.has(c.email.toLowerCase()));

  const now = new Date().toISOString();
  await admin
    .from("campaigns")
    .update({ status: "approved", approved_by: me.id, approved_at: now })
    .eq("id", campaign.id);

  const adSubject = campaign.subject.startsWith("(광고)")
    ? campaign.subject
    : `(광고) ${campaign.subject}`;

  const baseUrl = siteUrl().replace(/\/$/, "");

  for (const contact of eligible) {
    const sig = signUnsubscribe(me.org_id, contact.email);
    const unsubUrl = `${baseUrl}/unsubscribe?org=${encodeURIComponent(me.org_id)}&email=${encodeURIComponent(contact.email)}&sig=${sig}`;
    const fullHtml = `${campaign.body_html}
<hr style="border:none;border-top:1px solid #e2e8f0;margin:28px 0 14px;">
<p style="font-size:12px;color:#64748b;line-height:1.6;">
  본 메일은 수신 동의하신 분께 발송되는 안내 메일입니다.<br>
  더 이상 메일 수신을 원하지 않으시면 <a href="${unsubUrl}" style="color:#2563eb;">수신거부</a>를 클릭해 주세요.
</p>`;

    const result = await sendResendEmail({
      to: contact.email,
      subject: adSubject,
      html: fullHtml,
    });

    await admin.from("campaign_sends").upsert(
      {
        campaign_id: campaign.id,
        contact_id: contact.id,
        status: result.ok ? "sent" : "failed",
        sent_at: result.ok ? new Date().toISOString() : null,
        error: result.error ?? null,
      },
      { onConflict: "campaign_id,contact_id" }
    );
  }

  await admin.from("campaigns").update({ status: "sent" }).eq("id", campaign.id);
  revalidatePath("/campaigns");
}

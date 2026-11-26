"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth";
import type { FormState } from "@/components/ActionForm";

export async function addSchedule(_: FormState, formData: FormData): Promise<FormState> {
  const me = await requireRole("org_admin");
  if (!me.org_id) return { error: "소속 고객사가 없습니다." };

  const hour = Number(formData.get("hour_kst"));
  const sendEmail = formData.get("send_email") === "on";

  if (!Number.isInteger(hour) || hour < 0 || hour > 23) {
    return { error: "시간은 0시~23시 사이여야 합니다." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("schedules").insert({
    org_id: me.org_id,
    hour_kst: hour,
    send_email: sendEmail,
    active: true,
  });

  if (error) {
    if (error.code === "23505") {
      return { error: `${String(hour).padStart(2, "0")}:00 (KST) 스케줄은 이미 등록되어 있습니다.` };
    }
    return { error: `등록 실패: ${error.message}` };
  }

  revalidatePath("/settings/schedule");
  return { ok: `매일 ${String(hour).padStart(2, "0")}:00 (KST) 수집 스케줄을 추가했습니다.` };
}

export async function toggleScheduleActive(scheduleId: string, active: boolean) {
  const me = await requireRole("org_admin");
  if (!me.org_id) return;

  const supabase = await createClient();
  await supabase
    .from("schedules")
    .update({ active })
    .eq("id", scheduleId)
    .eq("org_id", me.org_id);

  revalidatePath("/settings/schedule");
}

export async function toggleScheduleEmail(scheduleId: string, sendEmail: boolean) {
  const me = await requireRole("org_admin");
  if (!me.org_id) return;

  const supabase = await createClient();
  await supabase
    .from("schedules")
    .update({ send_email: sendEmail })
    .eq("id", scheduleId)
    .eq("org_id", me.org_id);

  revalidatePath("/settings/schedule");
}

export async function deleteSchedule(scheduleId: string) {
  const me = await requireRole("org_admin");
  if (!me.org_id) return;

  const supabase = await createClient();
  await supabase.from("schedules").delete().eq("id", scheduleId).eq("org_id", me.org_id);

  revalidatePath("/settings/schedule");
}

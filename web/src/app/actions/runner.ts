"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { runDailyBriefing } from "@/lib/worker/runner";
import type { FormState } from "@/components/ActionForm";

export async function triggerManualRun(_: FormState, formData: FormData): Promise<FormState> {
  const me = await requireRole("platform_admin", "org_admin");
  const skipEmail = formData.get("send_email") !== "on";

  const summaries = await runDailyBriefing({
    orgId: me.role === "org_admin" ? me.org_id ?? undefined : undefined,
    skipEmail,
    maxAnalyze: 10,
  });

  revalidatePath("/dashboard");
  revalidatePath("/articles");
  revalidatePath("/targets");

  if (!summaries.length) return { error: "실행 대상 고객사가 없습니다." };
  const totalArticles = summaries.reduce((acc, s) => acc + s.articlesSaved, 0);
  const totalAnalyzed = summaries.reduce((acc, s) => acc + s.analyzedCount, 0);
  const errors = summaries.filter((s) => s.error).map((s) => `${s.orgName}: ${s.error}`);

  if (errors.length) return { error: `일부 오류 발생 — ${errors.join("; ")}` };
  return {
    ok: `수집 완료! 기사 ${totalArticles}건 저장, AI 분석 ${totalAnalyzed}건 처리되었습니다.`,
  };
}

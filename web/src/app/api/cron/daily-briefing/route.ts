import { NextResponse, type NextRequest } from "next/server";
import { runDailyBriefing } from "@/lib/worker/runner";

export const maxDuration = 60;

/**
 * Vercel Cron endpoint (configured in web/vercel.json: daily 08:00 KST / 23:00 UTC).
 * Vercel automatically sends `Authorization: Bearer <CRON_SECRET>`.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET?.trim();
  const authHeader = request.headers.get("authorization");

  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const summaries = await runDailyBriefing();
  return NextResponse.json({ ok: true, summaries });
}

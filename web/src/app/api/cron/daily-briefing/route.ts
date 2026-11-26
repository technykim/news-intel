import { NextResponse, type NextRequest } from "next/server";
import { runScheduledBriefings } from "@/lib/worker/runner";

export const maxDuration = 60;

/**
 * Vercel Cron endpoint (configured in web/vercel.json: hourly `0 * * * *`).
 * Checks organizations with an active schedule matching the current KST hour.
 * Optional `?hour=8` query param overrides the hour for manual testing.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET?.trim();
  const authHeader = request.headers.get("authorization");

  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const hourParam = request.nextUrl.searchParams.get("hour");
  const parsedHour = hourParam !== null ? Number(hourParam) : undefined;
  const result = await runScheduledBriefings(
    Number.isInteger(parsedHour) ? parsedHour : undefined
  );

  return NextResponse.json({ ok: true, ...result });
}

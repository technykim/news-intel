import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { analyzeArticleWithGemini } from "./analyzer";
import { sendDailyBriefing } from "./briefing";
import { scrapeGoogleNews, type ScrapedArticle } from "./scraper";

const MAX_ARTICLES_PER_ORG = 50;

export type OrgRunSummary = {
  orgId: string;
  orgName: string;
  articlesSaved: number;
  analyzedCount: number;
  emailSent: boolean;
  error?: string;
};

function getYesterdayKstStrings() {
  const nowKst = new Date(Date.now() + 9 * 60 * 60 * 1000 - 24 * 60 * 60 * 1000);
  const y = nowKst.getUTCFullYear();
  const m = String(nowKst.getUTCMonth() + 1).padStart(2, "0");
  const d = String(nowKst.getUTCDate()).padStart(2, "0");
  return { dateStr: `${y}${m}${d}`, displayDate: `${y}-${m}-${d}` };
}

export async function runDailyBriefing(options?: {
  orgId?: string;
  skipEmail?: boolean;
  skipAnalyze?: boolean;
  maxAnalyze?: number;
}): Promise<OrgRunSummary[]> {
  const admin = createAdminClient();
  const { dateStr, displayDate } = getYesterdayKstStrings();

  let orgQuery = admin.from("organizations").select("id, name").eq("active", true);
  if (options?.orgId) orgQuery = orgQuery.eq("id", options.orgId);
  const { data: orgs } = await orgQuery;

  const summaries: OrgRunSummary[] = [];

  for (const org of orgs ?? []) {
    try {
      const [{ data: keywords }, { data: recipients }] = await Promise.all([
        admin
          .from("keywords")
          .select("id, keyword, category")
          .eq("org_id", org.id)
          .eq("active", true),
        admin.from("recipients").select("email").eq("org_id", org.id),
      ]);

      if (!keywords?.length) {
        summaries.push({
          orgId: org.id,
          orgName: org.name,
          articlesSaved: 0,
          analyzedCount: 0,
          emailSent: false,
        });
        continue;
      }

      const perKw = Math.max(3, Math.floor(60 / keywords.length));
      const collected: ScrapedArticle[] = [];
      for (const kw of keywords) {
        const items = await scrapeGoogleNews(kw.keyword, kw.category || "기타", kw.id, perKw);
        collected.push(...items);
      }

      const seen = new Set<string>();
      const unique: ScrapedArticle[] = [];
      for (const art of collected) {
        if (!seen.has(art.link)) {
          seen.add(art.link);
          unique.push(art);
        }
      }
      const capped = unique.slice(0, MAX_ARTICLES_PER_ORG);

      if (capped.length) {
        await admin.from("articles").upsert(
          capped.map((a) => ({
            org_id: org.id,
            keyword_id: a.keyword_id ?? null,
            category: a.category,
            pub_date: a.pub_date,
            press: a.press,
            title: a.title,
            summary: a.summary,
            link: a.link,
          })),
          { onConflict: "org_id,link" }
        );
      }

      let analyzedCount = 0;
      if (!options?.skipAnalyze && process.env.GEMINI_API_KEY) {
        const analyzeLimit = options?.maxAnalyze ?? 20;
        const { data: unanalyzed } = await admin
          .from("articles")
          .select("id, title, summary, pub_date")
          .eq("org_id", org.id)
          .eq("analyzed", false)
          .order("collected_at", { ascending: false })
          .limit(analyzeLimit);

        for (const art of unanalyzed ?? []) {
          const entities = await analyzeArticleWithGemini(art.title, art.summary ?? "");
          for (const ent of entities) {
            const { data: existing } = await admin
              .from("entities")
              .select("id, homepage, industry")
              .eq("normalized_name", ent.normalized_name)
              .eq("type", ent.type)
              .limit(1);

            let entityId: string | null = existing?.[0]?.id ?? null;
            if (entityId) {
              const updates: Record<string, string> = {};
              if (!existing?.[0]?.homepage && ent.homepage) updates.homepage = ent.homepage;
              if (!existing?.[0]?.industry && ent.industry) updates.industry = ent.industry;
              if (Object.keys(updates).length) {
                await admin.from("entities").update(updates).eq("id", entityId);
              }
            } else {
              const { data: created } = await admin
                .from("entities")
                .insert({
                  name: ent.name,
                  normalized_name: ent.normalized_name,
                  type: ent.type,
                  homepage: ent.homepage,
                  industry: ent.industry,
                })
                .select("id")
                .single();
              entityId = created?.id ?? null;
            }

            if (!entityId) continue;

            await admin.from("article_entities").upsert(
              {
                article_id: art.id,
                entity_id: entityId,
                relevance: ent.relevance,
                context: ent.context,
              },
              { onConflict: "article_id,entity_id" }
            );

            const { data: existingTc } = await admin
              .from("target_companies")
              .select("id, mention_count")
              .eq("org_id", org.id)
              .eq("entity_id", entityId)
              .limit(1);

            const seenAt = art.pub_date ?? new Date().toISOString();
            if (existingTc?.[0]) {
              await admin
                .from("target_companies")
                .update({
                  mention_count: (existingTc[0].mention_count ?? 0) + 1,
                  last_seen: seenAt,
                })
                .eq("id", existingTc[0].id);
            } else {
              await admin.from("target_companies").insert({
                org_id: org.id,
                entity_id: entityId,
                status: "new",
                mention_count: 1,
                last_seen: seenAt,
              });
            }
          }

          await admin.from("articles").update({ analyzed: true }).eq("id", art.id);
          analyzedCount++;
        }
      }

      let emailSent = false;
      const emailList = Array.from(
        new Set((recipients ?? []).map((r) => r.email.trim().toLowerCase()).filter(Boolean))
      );
      if (!options?.skipEmail && emailList.length && process.env.RESEND_API_KEY) {
        const res = await sendDailyBriefing({
          orgName: org.name,
          recipients: emailList,
          dateStr,
          displayDate,
          articles: capped,
        });
        emailSent = res.ok;
      }

      await admin.from("run_logs").insert({
        org_id: org.id,
        article_count: capped.length,
        status: "success",
      });

      summaries.push({
        orgId: org.id,
        orgName: org.name,
        articlesSaved: capped.length,
        analyzedCount,
        emailSent,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await admin.from("run_logs").insert({
        org_id: org.id,
        article_count: 0,
        status: "error",
        error: msg.slice(0, 1000),
      });
      summaries.push({
        orgId: org.id,
        orgName: org.name,
        articlesSaved: 0,
        analyzedCount: 0,
        emailSent: false,
        error: msg,
      });
    }
  }

  return summaries;
}

/**
 * Runs briefings for organizations that have an active schedule matching `targetHourKst`
 * (defaults to the current KST hour). Called hourly by Vercel Cron.
 */
export async function runScheduledBriefings(targetHourKst?: number): Promise<{
  hourKst: number;
  summaries: OrgRunSummary[];
}> {
  const nowKst = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const hourKst =
    typeof targetHourKst === "number" && targetHourKst >= 0 && targetHourKst <= 23
      ? targetHourKst
      : nowKst.getUTCHours();

  const admin = createAdminClient();
  const { data: rows } = await admin
    .from("schedules")
    .select("org_id, send_email")
    .eq("hour_kst", hourKst)
    .eq("active", true);

  const summaries: OrgRunSummary[] = [];
  for (const row of rows ?? []) {
    const res = await runDailyBriefing({
      orgId: row.org_id,
      skipEmail: !row.send_email,
    });
    summaries.push(...res);
  }
  return { hourKst, summaries };
}

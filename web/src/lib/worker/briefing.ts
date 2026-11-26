import "server-only";
import { sendResendEmail } from "@/lib/resend";
import { siteUrl } from "@/lib/auth";
import type { ScrapedArticle } from "./scraper";

function csvCell(v: string): string {
  const escaped = v.replace(/"/g, '""');
  return `"${escaped}"`;
}

function buildCsvBase64(articles: ScrapedArticle[]): string {
  const header = ["보도일시", "언론사명", "분야", "주요내용", "링크"].map(csvCell).join(",");
  const lines = articles.map((a) =>
    [a.pub_display, a.press, a.category, `[${a.title}]\n${a.summary}`, a.link]
      .map(csvCell)
      .join(",")
  );
  const csv = "\uFEFF" + [header, ...lines].join("\r\n");
  return Buffer.from(csv, "utf8").toString("base64");
}

function buildHtml(orgName: string, displayDate: string, webUrl: string, articles: ScrapedArticle[]): string {
  const grouped = new Map<string, ScrapedArticle[]>();
  for (const art of articles) {
    const cat = art.category || "기타";
    const list = grouped.get(cat) ?? [];
    list.push(art);
    grouped.set(cat, list);
  }

  let sections = "";
  if (!articles.length) {
    sections =
      '<div style="background:#f8fafc;border:1px dashed #cbd5e1;border-radius:8px;padding:24px;text-align:center;color:#64748b;">수집된 뉴스 기사가 없습니다.</div>';
  } else {
    for (const [cat, items] of grouped.entries()) {
      const li = items
        .slice(0, 5)
        .map(
          (a) =>
            `<li style="margin-bottom:10px;line-height:1.5;"><a href="${a.link}" target="_blank" style="color:#0f172a;text-decoration:none;font-weight:600;">${a.title}</a> <span style="font-size:12px;color:#64748b;background:#f1f5f9;padding:2px 6px;border-radius:4px;">${a.press}</span></li>`
        )
        .join("");
      sections += `<div style="margin-bottom:22px;"><div style="font-size:15px;font-weight:700;color:#1e293b;margin-bottom:10px;border-bottom:2px solid #e2e8f0;padding-bottom:6px;">${cat} (${items.length}건)</div><ul style="list-style:none;padding:0;margin:0;">${li}</ul></div>`;
    }
  }

  return `<!DOCTYPE html>
<html><body style="font-family:'Apple SD Gothic Neo','Malgun Gothic',sans-serif;background:#f1f5f9;padding:28px;margin:0;">
  <div style="max-width:650px;margin:0 auto;background:#fff;border-radius:12px;border:1px solid #e2e8f0;overflow:hidden;">
    <div style="background:#0f172a;color:#fff;padding:28px 36px;text-align:center;">
      <div style="font-size:12px;letter-spacing:2px;color:#60a5fa;font-weight:700;">DAILY MARKETING BRIEFING</div>
      <h1 style="margin:8px 0 4px;font-size:22px;">${orgName} 일일 마케팅 동향 브리핑</h1>
      <p style="margin:0;font-size:13px;color:#94a3b8;">수집 기준일: ${displayDate} · 총 ${articles.length}건</p>
    </div>
    <div style="padding:32px 36px;">
      <p style="font-size:15px;color:#334155;line-height:1.7;margin-top:0;">
        안녕하세요,<br>
        등록된 키워드를 중심으로 최근 24시간 <strong>${displayDate}</strong> 자 뉴스 기사를 수집하였습니다.<br>
        전체 기사 및 AI 분석 타겟 회사는 대시보드와 첨부 CSV 파일에서 즉시 확인하실 수 있습니다.
      </p>
      <div style="text-align:center;margin:24px 0 32px;">
        <a href="${webUrl}/articles" target="_blank" style="background:#2563eb;color:#fff;text-decoration:none;padding:12px 26px;border-radius:8px;font-weight:700;display:inline-block;">대시보드에서 전체 확인하기</a>
      </div>
      ${sections}
    </div>
    <div style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:18px 36px;text-align:center;font-size:12px;color:#64748b;">
      키워드 및 수신자 변경은 <a href="${webUrl}/settings/keywords" style="color:#2563eb;">웹 설정 화면</a>에서 가능합니다.
    </div>
  </div>
</body></html>`;
}

export async function sendDailyBriefing(params: {
  orgName: string;
  recipients: string[];
  dateStr: string;
  displayDate: string;
  articles: ScrapedArticle[];
}) {
  if (!params.recipients.length) return { ok: false, error: "수신자 없음" };
  const webUrl = siteUrl().replace(/\/$/, "");
  return sendResendEmail({
    to: params.recipients,
    subject: `[${params.displayDate}] ${params.orgName} 일일 마케팅 동향 브리핑`,
    html: buildHtml(params.orgName, params.displayDate, webUrl, params.articles),
    attachments: [
      {
        filename: `news_briefing_${params.dateStr}.csv`,
        content: buildCsvBase64(params.articles),
      },
    ],
  });
}

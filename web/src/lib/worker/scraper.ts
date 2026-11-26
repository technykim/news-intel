import "server-only";

export type ScrapedArticle = {
  keyword_id?: string;
  category: string;
  pub_date: string;
  pub_display: string;
  press: string;
  title: string;
  summary: string;
  link: string;
};

function decodeEntities(str: string): string {
  return str
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;|\u00a0/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
}

function extractTag(xml: string, tag: string): string {
  const re = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, "i");
  const m = xml.match(re);
  return m ? m[1].trim() : "";
}

function formatKstDisplay(date: Date): string {
  const kst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  const y = kst.getUTCFullYear();
  const m = String(kst.getUTCMonth() + 1).padStart(2, "0");
  const d = String(kst.getUTCDate()).padStart(2, "0");
  const hh = String(kst.getUTCHours()).padStart(2, "0");
  const mm = String(kst.getUTCMinutes()).padStart(2, "0");
  return `${y}-${m}-${d} ${hh}:${mm}`;
}

export async function scrapeGoogleNews(
  keyword: string,
  category: string,
  keywordId: string,
  maxResults = 15
): Promise<ScrapedArticle[]> {
  const query = encodeURIComponent(`${keyword} when:1d`);
  const url = `https://news.google.com/rss/search?q=${query}&hl=ko&gl=KR&ceid=KR:ko`;

  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    },
    cache: "no-store",
  });

  if (!res.ok) return [];
  const xml = await res.text();
  const items = xml.match(/<item>[\s\S]*?<\/item>/gi) ?? [];

  const articles: ScrapedArticle[] = [];
  for (const item of items) {
    if (articles.length >= maxResults) break;

    const titleFull = decodeEntities(extractTag(item, "title"));
    const link = decodeEntities(extractTag(item, "link")).trim();
    const pubDateRaw = extractTag(item, "pubDate");
    let press = decodeEntities(extractTag(item, "source")) || "알수없음";

    let title = titleFull;
    const sepIdx = titleFull.lastIndexOf(" - ");
    if (sepIdx !== -1) {
      title = titleFull.slice(0, sepIdx).trim();
      if (press === "알수없음") {
        press = titleFull.slice(sepIdx + 3).trim();
      }
    }

    const parsedDate = pubDateRaw ? new Date(pubDateRaw) : new Date();
    const validDate = Number.isNaN(parsedDate.getTime()) ? new Date() : parsedDate;

    const descRaw = extractTag(item, "description");
    let summary = decodeEntities(descRaw)
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;|\u00a0/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    if (title && summary.includes(title)) {
      summary = summary.replace(title, "").trim();
    }
    if (!summary || summary.length < 5) summary = title;
    if (summary.length > 300) summary = `${summary.slice(0, 300)}...`;

    if (!link || !title) continue;

    articles.push({
      keyword_id: keywordId,
      category,
      pub_date: validDate.toISOString(),
      pub_display: formatKstDisplay(validDate),
      press,
      title,
      summary,
      link,
    });
  }

  return articles;
}

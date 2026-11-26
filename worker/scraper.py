import email.utils
import html
import re
import urllib.parse
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta, timezone

import requests

KST = timezone(timedelta(hours=9))


def scrape_google_news(keyword: str, target_date: datetime, max_results: int = 15) -> list[dict]:
    """
    Scrapes Korean news articles from the last 24 hours via Google News RSS.
    Returns dicts with ISO8601 pub_date (KST), press, title, summary, link.
    """
    query = f"{keyword} when:1d"
    encoded_query = urllib.parse.quote(query)
    url = f"https://news.google.com/rss/search?q={encoded_query}&hl=ko&gl=KR&ceid=KR:ko"
    headers = {
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        )
    }

    articles: list[dict] = []
    fallback_iso = target_date.astimezone(KST).isoformat()

    try:
        response = requests.get(url, headers=headers, timeout=15)
        if response.status_code != 200:
            print(f"[-] Google News RSS failed ({response.status_code}) for '{keyword}'")
            return []

        root = ET.fromstring(response.content)
        for item in root.findall(".//item"):
            if len(articles) >= max_results:
                break

            title_full = html.unescape(item.findtext("title") or "")
            link = (item.findtext("link") or "").strip()
            pub_date_raw = item.findtext("pubDate") or ""
            press = html.unescape(item.findtext("source") or "알수없음")

            title = title_full
            if " - " in title_full:
                parts = title_full.rsplit(" - ", 1)
                title = parts[0].strip()
                if press == "알수없음":
                    press = parts[1].strip()

            pub_iso = fallback_iso
            pub_display = target_date.astimezone(KST).strftime("%Y-%m-%d %H:%M")
            if pub_date_raw:
                try:
                    dt_kst = email.utils.parsedate_to_datetime(pub_date_raw).astimezone(KST)
                    pub_iso = dt_kst.isoformat()
                    pub_display = dt_kst.strftime("%Y-%m-%d %H:%M")
                except Exception as exc:
                    print(f"[-] Date parse error: {exc}")

            description_raw = item.findtext("description") or ""
            summary = ""
            if description_raw:
                decoded = html.unescape(description_raw)
                summary = re.sub(r"<[^<]+?>", "", decoded)
                summary = summary.replace("&nbsp;", " ").replace("\xa0", " ")
                summary = re.sub(r"\s+", " ", summary).strip()
                if title in summary:
                    summary = summary.replace(title, "").strip()

            if not summary or len(summary) < 5:
                summary = title
            if len(summary) > 300:
                summary = summary[:300] + "..."

            if not link or not title:
                continue

            articles.append(
                {
                    "pub_date": pub_iso,
                    "pub_display": pub_display,
                    "press": press,
                    "title": title,
                    "summary": summary,
                    "link": link,
                }
            )
    except Exception as exc:
        print(f"[-] Error scraping '{keyword}': {exc}")

    return articles

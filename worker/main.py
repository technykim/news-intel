import argparse
import time
from datetime import datetime, timedelta, timezone

from dotenv import load_dotenv

from analyzer import analyze_article
from db import (
    get_active_organizations,
    get_org_settings,
    get_supabase,
    get_unanalyzed_articles,
    save_article_entities,
    save_articles,
    write_run_log,
)
from notifier import send_briefing_resend
from scraper import KST, scrape_google_news

MAX_ARTICLES_PER_ORG = 50


def process_organization(sb, org: dict, target_date: datetime, skip_analyze: bool, skip_email: bool) -> None:
    org_id = org["id"]
    org_name = org["name"]
    date_str = target_date.strftime("%Y%m%d")
    display_date = target_date.strftime("%Y-%m-%d")

    print(f"\n=== [{org_name}] ({org_id}) ===")
    try:
        keywords, recipients = get_org_settings(sb, org_id)
        if not keywords:
            print(f"[!] No active keywords for '{org_name}'. Skipping.")
            return

        per_kw_limit = max(3, 60 // len(keywords))
        collected: list[dict] = []
        for kw in keywords:
            print(f"  [*] Scraping '{kw['keyword']}' ({kw['category']})...")
            items = scrape_google_news(kw["keyword"], target_date, max_results=per_kw_limit)
            for item in items:
                item["keyword_id"] = kw["id"]
                item["category"] = kw["category"]
            collected.extend(items)
            time.sleep(0.5)

        # Deduplicate by link & cap to 50
        seen: set[str] = set()
        unique: list[dict] = []
        for art in collected:
            if art["link"] not in seen:
                seen.add(art["link"])
                unique.append(art)
        unique = unique[:MAX_ARTICLES_PER_ORG]

        save_articles(sb, org_id, unique)
        print(f"  [+] Saved {len(unique)} unique articles.")

        if not skip_analyze:
            unanalyzed = get_unanalyzed_articles(sb, org_id, limit=MAX_ARTICLES_PER_ORG)
            print(f"  [*] Analyzing {len(unanalyzed)} unanalyzed articles with Gemini...")
            for art in unanalyzed:
                entities = analyze_article(art["title"], art.get("summary") or "")
                save_article_entities(sb, org_id, art, entities)
                time.sleep(0.3)

        if not skip_email:
            send_briefing_resend(org_name, recipients, date_str, display_date, unique)

        write_run_log(sb, org_id, len(unique), "success")
    except Exception as exc:
        print(f"  [-] Failed for '{org_name}': {exc}")
        try:
            write_run_log(sb, org_id, 0, "error", str(exc))
        except Exception:
            pass


def main() -> None:
    load_dotenv()
    parser = argparse.ArgumentParser(description="News Intel daily scraper & analyzer")
    parser.add_argument("--org-id", help="Run only for a specific organization UUID")
    parser.add_argument("--skip-analyze", action="store_true", help="Skip Gemini entity extraction")
    parser.add_argument("--skip-email", action="store_true", help="Skip Resend briefing email")
    args = parser.parse_args()

    now_kst = datetime.now(timezone.utc).astimezone(KST)
    yesterday_kst = now_kst - timedelta(days=1)
    print(f"[*] Target date (KST): {yesterday_kst.strftime('%Y-%m-%d')}")

    sb = get_supabase()
    orgs = get_active_organizations(sb, args.org_id)
    print(f"[*] Active organizations to process: {len(orgs)}")

    for org in orgs:
        process_organization(sb, org, yesterday_kst, args.skip_analyze, args.skip_email)

    print("\n[+] Worker run finished.")


if __name__ == "__main__":
    main()

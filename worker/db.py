import os
from datetime import datetime, timezone

from supabase import Client, create_client


def get_supabase() -> Client:
    url = os.environ.get("SUPABASE_URL", "").strip()
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "").strip()
    if not url or not key:
        raise RuntimeError("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.")
    return create_client(url, key)


def get_active_organizations(sb: Client, org_id: str | None = None) -> list[dict]:
    query = sb.table("organizations").select("id, name").eq("active", True)
    if org_id:
        query = query.eq("id", org_id)
    return query.execute().data or []


def get_org_settings(sb: Client, org_id: str) -> tuple[list[dict], list[str]]:
    kw_rows = (
        sb.table("keywords")
        .select("id, keyword, category")
        .eq("org_id", org_id)
        .eq("active", True)
        .execute()
        .data
        or []
    )
    rec_rows = (
        sb.table("recipients")
        .select("email")
        .eq("org_id", org_id)
        .execute()
        .data
        or []
    )
    emails = sorted({r["email"].strip().lower() for r in rec_rows if r.get("email")})
    return kw_rows, emails


def save_articles(sb: Client, org_id: str, articles: list[dict]) -> list[dict]:
    """Upserts articles for an org (deduplicated by org_id + link) and returns saved rows."""
    if not articles:
        return []
    rows = [
        {
            "org_id": org_id,
            "keyword_id": a.get("keyword_id"),
            "category": a.get("category") or "기타",
            "pub_date": a["pub_date"],
            "press": a.get("press") or "알수없음",
            "title": a["title"],
            "summary": a.get("summary") or "",
            "link": a["link"],
        }
        for a in articles
    ]
    res = sb.table("articles").upsert(rows, on_conflict="org_id,link").execute()
    return res.data or []


def get_unanalyzed_articles(sb: Client, org_id: str, limit: int = 50) -> list[dict]:
    return (
        sb.table("articles")
        .select("id, title, summary, pub_date")
        .eq("org_id", org_id)
        .eq("analyzed", False)
        .order("collected_at", desc=True)
        .limit(limit)
        .execute()
        .data
        or []
    )


def save_article_entities(sb: Client, org_id: str, article: dict, extracted: list[dict]) -> None:
    """Upserts shared entities, links article_entities, and accumulates target_companies."""
    now_iso = article.get("pub_date") or datetime.now(timezone.utc).isoformat()

    for ent in extracted:
        # 1. Find or create shared entity
        existing = (
            sb.table("entities")
            .select("id, homepage, industry")
            .eq("normalized_name", ent["normalized_name"])
            .eq("type", ent["type"])
            .execute()
            .data
        )
        if existing:
            entity_id = existing[0]["id"]
            updates = {}
            if not existing[0].get("homepage") and ent.get("homepage"):
                updates["homepage"] = ent["homepage"]
            if not existing[0].get("industry") and ent.get("industry"):
                updates["industry"] = ent["industry"]
            if updates:
                sb.table("entities").update(updates).eq("id", entity_id).execute()
        else:
            inserted = (
                sb.table("entities")
                .insert(
                    {
                        "name": ent["name"],
                        "normalized_name": ent["normalized_name"],
                        "type": ent["type"],
                        "homepage": ent.get("homepage"),
                        "industry": ent.get("industry"),
                    }
                )
                .execute()
                .data
            )
            if not inserted:
                continue
            entity_id = inserted[0]["id"]

        # 2. Link article <-> entity
        sb.table("article_entities").upsert(
            {
                "article_id": article["id"],
                "entity_id": entity_id,
                "relevance": ent.get("relevance"),
                "context": ent.get("context"),
            },
            on_conflict="article_id,entity_id",
        ).execute()

        # 3. Accumulate in org's target_companies
        existing_tc = (
            sb.table("target_companies")
            .select("id, mention_count")
            .eq("org_id", org_id)
            .eq("entity_id", entity_id)
            .execute()
            .data
        )
        if existing_tc:
            sb.table("target_companies").update(
                {
                    "mention_count": (existing_tc[0].get("mention_count") or 0) + 1,
                    "last_seen": now_iso,
                }
            ).eq("id", existing_tc[0]["id"]).execute()
        else:
            sb.table("target_companies").insert(
                {
                    "org_id": org_id,
                    "entity_id": entity_id,
                    "status": "new",
                    "mention_count": 1,
                    "last_seen": now_iso,
                }
            ).execute()

    sb.table("articles").update({"analyzed": True}).eq("id", article["id"]).execute()


def write_run_log(sb: Client, org_id: str, article_count: int, status: str, error: str | None = None) -> None:
    sb.table("run_logs").insert(
        {
            "org_id": org_id,
            "article_count": article_count,
            "status": status,
            "error": error[:1000] if error else None,
        }
    ).execute()

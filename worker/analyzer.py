import json
import os
import re

import requests

VALID_TYPES = {"company", "organization", "person"}

PROMPT_TEMPLATE = """다음 한국어 뉴스 기사 제목과 요약에서 마케팅 타겟이 될 수 있는 회사, 기관/단체, 주요 인물을 추출하세요.
언론사 자체는 제외하세요.

반드시 아래 JSON 배열 형식으로만 응답하세요 (최대 5개):
[
  {{
    "name": "공식 명칭 (예: 삼성전자, 한국보건산업진흥원)",
    "type": "company | organization | person 중 하나",
    "homepage": "알고 있는 공식 홈페이지 URL (확실하지 않으면 null)",
    "industry": "업종/분야 (예: 디지털 헬스케어, AI, 금융, 모르면 null)",
    "relevance": 0.0~1.0 사이 숫자,
    "context": "기사에서 이 대상이 언급된 맥락 1문장"
  }}
]

제목: {title}
요약: {summary}
"""


def normalize_entity_name(name: str) -> str:
    """Normalizes Korean/English company names to reduce duplicate entity rows."""
    cleaned = name.strip()
    cleaned = re.sub(r"\(주\)|㈜|주식회사|유한회사|\(유\)|Inc\.?|Corp\.?|Co\.?,?\s*Ltd\.?", "", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"\s+", "", cleaned).lower()
    return cleaned or name.strip().lower()


def analyze_article(title: str, summary: str) -> list[dict]:
    """Calls Gemini REST API to extract structured entities from an article."""
    api_key = os.environ.get("GEMINI_API_KEY", "").strip()
    if not api_key:
        return []

    model = os.environ.get("GEMINI_MODEL", "gemini-2.5-flash").strip() or "gemini-2.5-flash"
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={api_key}"

    payload = {
        "contents": [{"parts": [{"text": PROMPT_TEMPLATE.format(title=title, summary=summary or "")}]}],
        "generationConfig": {
            "temperature": 0.1,
            "responseMimeType": "application/json",
        },
    }

    try:
        resp = requests.post(url, json=payload, timeout=30)
        if resp.status_code != 200:
            print(f"[-] Gemini API error ({resp.status_code}): {resp.text[:200]}")
            return []

        data = resp.json()
        text = data["candidates"][0]["content"]["parts"][0]["text"]
        parsed = json.loads(text)
        if not isinstance(parsed, list):
            return []

        results: list[dict] = []
        for item in parsed:
            if not isinstance(item, dict):
                continue
            name = str(item.get("name") or "").strip()
            etype = str(item.get("type") or "").strip().lower()
            if not name or etype not in VALID_TYPES:
                continue

            homepage = item.get("homepage")
            if isinstance(homepage, str):
                homepage = homepage.strip()
                if not homepage.startswith(("http://", "https://")):
                    homepage = None
            else:
                homepage = None

            industry = item.get("industry")
            industry = industry.strip() if isinstance(industry, str) and industry.strip() else None

            try:
                relevance = round(max(0.0, min(1.0, float(item.get("relevance", 0.5)))), 2)
            except (TypeError, ValueError):
                relevance = 0.5

            context = str(item.get("context") or "").strip()[:300] or None

            results.append(
                {
                    "name": name,
                    "normalized_name": normalize_entity_name(name),
                    "type": etype,
                    "homepage": homepage,
                    "industry": industry,
                    "relevance": relevance,
                    "context": context,
                }
            )
        return results
    except Exception as exc:
        print(f"[-] Gemini analysis error for '{title[:40]}': {exc}")
        return []

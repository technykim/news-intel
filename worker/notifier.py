import base64
import csv
import io
import os

import requests


def _build_csv_base64(articles: list[dict]) -> str:
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(["보도일시", "언론사명", "분야", "주요내용", "링크"])
    for art in articles:
        writer.writerow(
            [
                art.get("pub_display") or art.get("pub_date", ""),
                art.get("press", ""),
                art.get("category", ""),
                f"[{art['title']}]\n{art.get('summary', '')}",
                art["link"],
            ]
        )
    raw = buf.getvalue().encode("utf-8-sig")
    return base64.b64encode(raw).decode("ascii")


def _build_html(org_name: str, display_date: str, web_url: str, articles: list[dict]) -> str:
    grouped: dict[str, list[dict]] = {}
    for art in articles:
        grouped.setdefault(art.get("category") or "기타", []).append(art)

    sections = ""
    if not articles:
        sections = (
            '<div style="background:#f8fafc;border:1px dashed #cbd5e1;border-radius:8px;'
            'padding:24px;text-align:center;color:#64748b;">수집된 뉴스 기사가 없습니다.</div>'
        )
    else:
        for cat, items in grouped.items():
            items_html = ""
            for art in items[:5]:
                items_html += (
                    f'<li style="margin-bottom:10px;line-height:1.5;">'
                    f'<a href="{art["link"]}" target="_blank" style="color:#0f172a;text-decoration:none;font-weight:600;">{art["title"]}</a>'
                    f' <span style="font-size:12px;color:#64748b;background:#f1f5f9;padding:2px 6px;border-radius:4px;">{art.get("press", "")}</span>'
                    f"</li>"
                )
            sections += (
                f'<div style="margin-bottom:22px;">'
                f'<div style="font-size:15px;font-weight:700;color:#1e293b;margin-bottom:10px;'
                f'border-bottom:2px solid #e2e8f0;padding-bottom:6px;">{cat} ({len(items)}건)</div>'
                f'<ul style="list-style:none;padding:0;margin:0;">{items_html}</ul></div>'
            )

    return f"""<!DOCTYPE html>
<html><body style="font-family:'Apple SD Gothic Neo','Malgun Gothic',sans-serif;background:#f1f5f9;padding:28px;margin:0;">
  <div style="max-width:650px;margin:0 auto;background:#fff;border-radius:12px;border:1px solid #e2e8f0;overflow:hidden;">
    <div style="background:#0f172a;color:#fff;padding:28px 36px;text-align:center;">
      <div style="font-size:12px;letter-spacing:2px;color:#60a5fa;font-weight:700;">DAILY MARKETING BRIEFING</div>
      <h1 style="margin:8px 0 4px;font-size:22px;">{org_name} 일일 마케팅 동향 브리핑</h1>
      <p style="margin:0;font-size:13px;color:#94a3b8;">수집 기준일: {display_date} · 총 {len(articles)}건</p>
    </div>
    <div style="padding:32px 36px;">
      <p style="font-size:15px;color:#334155;line-height:1.7;margin-top:0;">
        안녕하세요,<br>
        등록된 키워드를 중심으로 최근 24시간 <strong>{display_date}</strong> 자 뉴스 기사를 수집하였습니다.<br>
        전체 기사 및 AI 분석 타겟 회사는 대시보드와 첨부 CSV 파일에서 즉시 확인하실 수 있습니다.
      </p>
      <div style="text-align:center;margin:24px 0 32px;">
        <a href="{web_url}/articles" target="_blank" style="background:#2563eb;color:#fff;text-decoration:none;padding:12px 26px;border-radius:8px;font-weight:700;display:inline-block;">
          대시보드에서 전체 확인하기
        </a>
      </div>
      {sections}
    </div>
    <div style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:18px 36px;text-align:center;font-size:12px;color:#64748b;">
      키워드 및 수신자 변경은 <a href="{web_url}/settings/keywords" style="color:#2563eb;">웹 설정 화면</a>에서 가능합니다.
    </div>
  </div>
</body></html>"""


def send_briefing_resend(
    org_name: str,
    recipients: list[str],
    date_str: str,
    display_date: str,
    articles: list[dict],
) -> bool:
    """Sends the daily HTML briefing + CSV attachment using the Resend REST API."""
    api_key = os.environ.get("RESEND_API_KEY", "").strip()
    from_email = os.environ.get("RESEND_FROM_EMAIL", "").strip()
    web_url = os.environ.get("WEB_APP_URL", "http://localhost:3000").rstrip("/")

    if not api_key or not from_email:
        print("[!] RESEND_API_KEY or RESEND_FROM_EMAIL not set. Skipping email.")
        return False
    if not recipients:
        print(f"[!] No recipients for '{org_name}'. Skipping email.")
        return False

    payload = {
        "from": from_email,
        "to": recipients,
        "subject": f"[{display_date}] {org_name} 일일 마케팅 동향 브리핑",
        "html": _build_html(org_name, display_date, web_url, articles),
        "attachments": [
            {
                "filename": f"news_briefing_{date_str}.csv",
                "content": _build_csv_base64(articles),
            }
        ],
    }

    resp = requests.post(
        "https://api.resend.com/emails",
        headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
        json=payload,
        timeout=20,
    )
    if resp.status_code >= 300:
        raise RuntimeError(f"Resend API error ({resp.status_code}): {resp.text}")

    print(f"[+] Briefing sent to {len(recipients)} recipient(s) for '{org_name}'.")
    return True

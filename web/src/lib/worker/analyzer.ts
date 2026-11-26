import "server-only";

export type ExtractedEntity = {
  name: string;
  normalized_name: string;
  type: "company" | "organization" | "person";
  homepage: string | null;
  industry: string | null;
  relevance: number;
  context: string | null;
};

const VALID_TYPES = new Set(["company", "organization", "person"]);

export function normalizeEntityName(name: string): string {
  const cleaned = name
    .trim()
    .replace(/\(주\)|㈜|주식회사|유한회사|\(유\)|Inc\.?|Corp\.?|Co\.?,?\s*Ltd\.?/gi, "")
    .replace(/\s+/g, "")
    .toLowerCase();
  return cleaned || name.trim().toLowerCase();
}

export async function analyzeArticleWithGemini(
  title: string,
  summary: string
): Promise<ExtractedEntity[]> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) return [];

  const model = process.env.GEMINI_MODEL?.trim() || "gemini-2.5-flash";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const prompt = `다음 한국어 뉴스 기사 제목과 요약에서 마케팅 타겟이 될 수 있는 회사, 기관/단체, 주요 인물을 추출하세요.
언론사 자체는 제외하세요.

반드시 아래 JSON 배열 형식으로만 응답하세요 (최대 5개):
[
  {
    "name": "공식 명칭 (예: 삼성전자, 한국보건산업진흥원)",
    "type": "company | organization | person 중 하나",
    "homepage": "알고 있는 공식 홈페이지 URL (확실하지 않으면 null)",
    "industry": "업종/분야 (예: 디지털 헬스케어, AI, 금융, 모르면 null)",
    "relevance": 0.0~1.0 사이 숫자,
    "context": "기사에서 이 대상이 언급된 맥락 1문장"
  }
]

제목: ${title}
요약: ${summary}`;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.1,
          responseMimeType: "application/json",
        },
      }),
    });

    if (!res.ok) return [];
    const data = await res.json();
    const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!rawText) return [];

    const parsed = JSON.parse(rawText);
    if (!Array.isArray(parsed)) return [];

    const results: ExtractedEntity[] = [];
    for (const item of parsed) {
      if (!item || typeof item !== "object") continue;
      const name = String(item.name ?? "").trim();
      const type = String(item.type ?? "").trim().toLowerCase();
      if (!name || !VALID_TYPES.has(type)) continue;

      const hp = typeof item.homepage === "string" ? item.homepage.trim() : "";
      const homepage = hp.startsWith("http://") || hp.startsWith("https://") ? hp : null;
      const ind = typeof item.industry === "string" ? item.industry.trim() : "";
      const industry = ind || null;
      const relNum = Number(item.relevance);
      const relevance = Number.isFinite(relNum)
        ? Math.round(Math.max(0, Math.min(1, relNum)) * 100) / 100
        : 0.5;
      const ctx = typeof item.context === "string" ? item.context.trim().slice(0, 300) : "";

      results.push({
        name,
        normalized_name: normalizeEntityName(name),
        type: type as ExtractedEntity["type"],
        homepage,
        industry,
        relevance,
        context: ctx || null,
      });
    }
    return results;
  } catch {
    return [];
  }
}

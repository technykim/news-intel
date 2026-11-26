import Link from "next/link";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

type ArticleRow = {
  id: string;
  category: string | null;
  pub_date: string | null;
  press: string | null;
  title: string;
  summary: string | null;
  link: string;
  analyzed: boolean;
  article_entities: {
    entities: { name: string; type: string; homepage: string | null } | null;
  }[];
};

export default async function ArticlesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; category?: string }>;
}) {
  const me = await requireProfile();
  const { q = "", category = "" } = await searchParams;

  if (!me.org_id) {
    return (
      <>
        <h1>수집 기사</h1>
        <div className="card">
          <p className="muted">소속 고객사가 있는 계정에서 수집 기사를 조회할 수 있습니다.</p>
        </div>
      </>
    );
  }

  const supabase = await createClient();

  let query = supabase
    .from("articles")
    .select(
      "id, category, pub_date, press, title, summary, link, analyzed, article_entities(entities(name, type, homepage))"
    )
    .eq("org_id", me.org_id)
    .order("pub_date", { ascending: false })
    .limit(100);

  if (category) query = query.eq("category", category);
  if (q.trim()) query = query.ilike("title", `%${q.trim()}%`);

  const [{ data: rows }, { data: kwCats }] = await Promise.all([
    query,
    supabase.from("keywords").select("category").eq("org_id", me.org_id),
  ]);

  const articles = (rows ?? []) as unknown as ArticleRow[];
  const categories = Array.from(new Set((kwCats ?? []).map((k) => k.category).filter(Boolean)));

  return (
    <>
      <h1>수집 기사</h1>
      <p className="muted">키워드 기반으로 자동 수집된 뉴스와 AI가 식별한 관련 기업·기관입니다.</p>

      <div className="card">
        <form method="get" className="form form-row" style={{ marginTop: 0 }}>
          <input name="q" defaultValue={q} placeholder="기사 제목 검색..." />
          <select name="category" defaultValue={category}>
            <option value="">전체 분야</option>
            {categories.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          <button type="submit" className="btn btn-primary">검색</button>
          {(q || category) && (
            <Link href="/articles" className="btn">초기화</Link>
          )}
        </form>
      </div>

      <div className="card">
        <h3>기사 목록 (최근 {articles.length}건)</h3>
        <table className="table">
          <thead>
            <tr>
              <th style={{ width: 115 }}>보도일시</th>
              <th style={{ width: 95 }}>분야</th>
              <th>제목 및 요약</th>
              <th style={{ width: 180 }}>식별된 대상</th>
            </tr>
          </thead>
          <tbody>
            {articles.map((a) => (
              <tr key={a.id}>
                <td className="small muted">
                  {a.pub_date
                    ? new Date(a.pub_date).toLocaleString("ko-KR", {
                        month: "2-digit",
                        day: "2-digit",
                        hour: "2-digit",
                        minute: "2-digit",
                      })
                    : "-"}
                  <div>{a.press}</div>
                </td>
                <td><span className="badge badge-muted">{a.category || "기타"}</span></td>
                <td>
                  <a href={a.link} target="_blank" rel="noreferrer">
                    <strong>{a.title}</strong>
                  </a>
                  {a.summary && <p className="muted small" style={{ margin: "4px 0 0" }}>{a.summary}</p>}
                </td>
                <td>
                  <div className="tag-list">
                    {a.article_entities?.map((ae, i) =>
                      ae.entities ? (
                        <span key={i} className="badge badge-ok">{ae.entities.name}</span>
                      ) : null
                    )}
                    {!a.article_entities?.length && (
                      <span className="muted small">{a.analyzed ? "없음" : "분석 대기"}</span>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {!articles.length && (
              <tr>
                <td colSpan={4} className="muted">수집된 기사가 없습니다.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}

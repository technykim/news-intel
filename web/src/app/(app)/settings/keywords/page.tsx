import ActionForm from "@/components/ActionForm";
import { addKeyword, deleteKeyword, toggleKeyword } from "@/app/actions/settings";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export default async function KeywordsPage() {
  const me = await requireProfile();
  const isAdmin = me.role === "org_admin";

  if (!me.org_id) {
    return (
      <>
        <h1>키워드 관리</h1>
        <div className="card">
          <p className="muted">소속 고객사가 있는 계정에서 키워드를 관리할 수 있습니다.</p>
        </div>
      </>
    );
  }

  const supabase = await createClient();
  const { data: keywords } = await supabase
    .from("keywords")
    .select("id, keyword, category, active, created_at")
    .eq("org_id", me.org_id)
    .order("created_at", { ascending: false });

  return (
    <>
      <h1>키워드 관리</h1>
      <p className="muted">매일 아침 자동 수집할 뉴스 검색 키워드와 분야를 관리합니다.</p>

      {isAdmin && (
        <div className="card">
          <h3>키워드 추가</h3>
          <ActionForm action={addKeyword} submitLabel="키워드 추가" className="form form-row">
            <input name="keyword" placeholder="검색 키워드 (예: 디지털치료제)" required />
            <input name="category" placeholder="분야 (예: 헬스케어, 비워두면 기타)" />
          </ActionForm>
        </div>
      )}

      <div className="card">
        <h3>등록된 키워드 ({keywords?.length ?? 0}개)</h3>
        <table className="table">
          <thead>
            <tr>
              <th>키워드</th>
              <th>분야</th>
              <th>상태</th>
              <th>등록일</th>
              {isAdmin && <th>관리</th>}
            </tr>
          </thead>
          <tbody>
            {(keywords ?? []).map((k) => (
              <tr key={k.id}>
                <td><strong>{k.keyword}</strong></td>
                <td>{k.category}</td>
                <td>
                  <span className={`badge ${k.active ? "badge-ok" : "badge-muted"}`}>
                    {k.active ? "수집 중" : "일시중지"}
                  </span>
                </td>
                <td>{new Date(k.created_at).toLocaleDateString("ko-KR")}</td>
                {isAdmin && (
                  <td>
                    <div className="row-actions">
                      <form action={toggleKeyword.bind(null, k.id, !k.active)}>
                        <button className="btn btn-small" type="submit">
                          {k.active ? "중지" : "재개"}
                        </button>
                      </form>
                      <form action={deleteKeyword.bind(null, k.id)}>
                        <button className="btn btn-small btn-danger" type="submit">
                          삭제
                        </button>
                      </form>
                    </div>
                  </td>
                )}
              </tr>
            ))}
            {!keywords?.length && (
              <tr>
                <td colSpan={isAdmin ? 5 : 4} className="muted">
                  등록된 키워드가 없습니다. 위에서 수집할 키워드를 추가해 주세요.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}

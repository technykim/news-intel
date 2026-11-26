import ActionForm from "@/components/ActionForm";
import { addRecipients, deleteRecipient } from "@/app/actions/settings";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export default async function RecipientsPage() {
  const me = await requireProfile();
  const isAdmin = me.role === "org_admin";

  if (!me.org_id) {
    return (
      <>
        <h1>브리핑 수신자 관리</h1>
        <div className="card">
          <p className="muted">소속 고객사가 있는 계정에서 수신자를 관리할 수 있습니다.</p>
        </div>
      </>
    );
  }

  const supabase = await createClient();
  const { data: recipients } = await supabase
    .from("recipients")
    .select("id, email, created_at")
    .eq("org_id", me.org_id)
    .order("created_at", { ascending: false });

  return (
    <>
      <h1>브리핑 수신자 관리</h1>
      <p className="muted">매일 아침 일일 뉴스 브리핑 메일과 CSV 파일을 받을 이메일 목록입니다.</p>

      {isAdmin && (
        <div className="card">
          <h3>수신자 추가</h3>
          <p className="muted small">
            쉼표(,) 또는 줄바꿈으로 여러 이메일을 한 번에 등록할 수 있습니다. 중복은 자동 제외됩니다.
          </p>
          <ActionForm action={addRecipients} submitLabel="수신자 추가" className="form form-row">
            <input
              name="emails"
              placeholder="예: a@company.com, b@company.com"
              required
            />
          </ActionForm>
        </div>
      )}

      <div className="card">
        <h3>등록된 수신자 ({recipients?.length ?? 0}명)</h3>
        <table className="table">
          <thead>
            <tr>
              <th>이메일</th>
              <th>등록일</th>
              {isAdmin && <th>관리</th>}
            </tr>
          </thead>
          <tbody>
            {(recipients ?? []).map((r) => (
              <tr key={r.id}>
                <td>{r.email}</td>
                <td>{new Date(r.created_at).toLocaleDateString("ko-KR")}</td>
                {isAdmin && (
                  <td>
                    <form action={deleteRecipient.bind(null, r.id)}>
                      <button className="btn btn-small btn-danger" type="submit">
                        삭제
                      </button>
                    </form>
                  </td>
                )}
              </tr>
            ))}
            {!recipients?.length && (
              <tr>
                <td colSpan={isAdmin ? 3 : 2} className="muted">
                  등록된 브리핑 수신자가 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}

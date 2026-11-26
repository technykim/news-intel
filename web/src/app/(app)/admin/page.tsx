import ActionForm from "@/components/ActionForm";
import { createOrganization, setOrganizationActive } from "@/app/actions/users";
import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export default async function AdminPage() {
  await requireRole("platform_admin");
  const { data: orgs } = await createAdminClient()
    .from("organizations")
    .select("id, name, plan, active, created_at, profiles(count)")
    .order("created_at", { ascending: false });

  return (
    <>
      <h1>고객사 관리</h1>
      <div className="card">
        <h3>새 고객사 등록</h3>
        <p className="muted small">고객사를 만들고 첫 관리자에게 초대 메일을 보냅니다.</p>
        <ActionForm action={createOrganization} submitLabel="고객사 생성 + 관리자 초대" className="form form-row">
          <input name="org_name" placeholder="고객사 이름" required />
          <input name="name" placeholder="관리자 이름" />
          <input name="email" type="email" placeholder="관리자 이메일" required />
        </ActionForm>
      </div>

      <div className="card">
        <h3>고객사 목록</h3>
        <table className="table">
          <thead>
            <tr><th>이름</th><th>플랜</th><th>사용자 수</th><th>등록일</th><th>상태</th></tr>
          </thead>
          <tbody>
            {(orgs ?? []).map((o) => (
              <tr key={o.id}>
                <td>{o.name}</td>
                <td>{o.plan}</td>
                <td>{(o.profiles as unknown as { count: number }[])?.[0]?.count ?? 0}</td>
                <td>{new Date(o.created_at).toLocaleDateString("ko-KR")}</td>
                <td>
                  <form action={setOrganizationActive.bind(null, o.id, !o.active)}>
                    <button className={`btn btn-small ${o.active ? "" : "btn-danger"}`} type="submit">
                      {o.active ? "사용 중 (중지)" : "중지됨 (재개)"}
                    </button>
                  </form>
                </td>
              </tr>
            ))}
            {!orgs?.length && <tr><td colSpan={5} className="muted">등록된 고객사가 없습니다.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}

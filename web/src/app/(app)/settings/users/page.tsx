import ActionForm from "@/components/ActionForm";
import { inviteMember, removeMember } from "@/app/actions/users";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export default async function UsersPage() {
  const me = await requireRole("org_admin");
  const supabase = await createClient();
  const { data: users } = await supabase
    .from("profiles")
    .select("id, email, name, role, password_set, created_at")
    .eq("org_id", me.org_id!)
    .order("created_at");

  return (
    <>
      <h1>사용자 관리</h1>
      <div className="card">
        <h3>사용자 초대</h3>
        <p className="muted small">초대 메일의 링크에서 사용자가 직접 비밀번호를 설정합니다.</p>
        <ActionForm action={inviteMember} submitLabel="초대 메일 보내기" className="form form-row">
          <input name="name" placeholder="이름" />
          <input name="email" type="email" placeholder="이메일" required />
          <select name="role" defaultValue="member">
            <option value="member">사용자</option>
            <option value="org_admin">관리자</option>
          </select>
        </ActionForm>
      </div>

      <div className="card">
        <h3>구성원</h3>
        <table className="table">
          <thead>
            <tr><th>이름</th><th>이메일</th><th>권한</th><th>상태</th><th></th></tr>
          </thead>
          <tbody>
            {(users ?? []).map((u) => (
              <tr key={u.id}>
                <td>{u.name || "-"}</td>
                <td>{u.email}</td>
                <td>{u.role === "org_admin" ? "관리자" : "사용자"}</td>
                <td>{u.password_set ? "활성" : <span className="badge">초대 대기</span>}</td>
                <td>
                  {u.id !== me.id && (
                    <form action={removeMember.bind(null, u.id)}>
                      <button className="btn btn-small btn-danger" type="submit">삭제</button>
                    </form>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

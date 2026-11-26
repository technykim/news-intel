import Link from "next/link";
import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { signOut } from "@/app/actions/auth";

const ROLE_LABEL = { platform_admin: "플랫폼 관리자", org_admin: "고객사 관리자", member: "사용자" };

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireProfile();
  // Invited users must set a password before using the app.
  if (!profile.password_set) redirect("/set-password");

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">News Intel</div>
        <div className="org">{profile.organizations?.name ?? "플랫폼"}</div>
        <nav>
          <Link href="/dashboard">대시보드</Link>
          {profile.org_id && <Link href="/articles">수집 기사</Link>}
          {profile.org_id && <Link href="/targets">타겟 회사</Link>}
          {profile.org_id && <Link href="/campaigns">마케팅 발송</Link>}
          {profile.org_id && <Link href="/settings/keywords">키워드 관리</Link>}
          {profile.org_id && <Link href="/settings/recipients">수신자 관리</Link>}
          {profile.role === "org_admin" && <Link href="/settings/users">사용자 관리</Link>}
          {profile.role === "platform_admin" && <Link href="/admin">고객사 관리</Link>}
          <Link href="/set-password">비밀번호 변경</Link>
        </nav>
        <div className="me">
          <div>{profile.name || profile.email}</div>
          <div className="muted small">{ROLE_LABEL[profile.role]}</div>
          <form action={signOut}>
            <button className="btn btn-ghost" type="submit">로그아웃</button>
          </form>
        </div>
      </aside>
      <main className="content">{children}</main>
    </div>
  );
}

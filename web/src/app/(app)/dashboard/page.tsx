import Link from "next/link";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export default async function DashboardPage() {
  const profile = await requireProfile();

  if (profile.role === "platform_admin" && !profile.org_id) {
    const admin = createAdminClient();
    const [{ count: orgCount }, { count: userCount }, { count: articleCount }] = await Promise.all([
      admin.from("organizations").select("id", { count: "exact", head: true }),
      admin.from("profiles").select("id", { count: "exact", head: true }),
      admin.from("articles").select("id", { count: "exact", head: true }),
    ]);

    return (
      <>
        <h1>플랫폼 대시보드</h1>
        <p className="muted">안녕하세요, {profile.name || profile.email} 님.</p>
        <div className="grid">
          <div className="card">
            <h3>등록 고객사</h3>
            <div className="stat-num">{orgCount ?? 0}</div>
            <Link href="/admin" className="small">고객사 관리 →</Link>
          </div>
          <div className="card">
            <h3>전체 사용자</h3>
            <div className="stat-num">{userCount ?? 0}</div>
          </div>
          <div className="card">
            <h3>누적 수집 기사</h3>
            <div className="stat-num">{articleCount ?? 0}</div>
          </div>
        </div>
      </>
    );
  }

  const supabase = await createClient();
  const [
    { count: activeKeywords },
    { count: recipientCount },
    { count: articleCount },
    { count: targetCount },
  ] = await Promise.all([
    supabase
      .from("keywords")
      .select("id", { count: "exact", head: true })
      .eq("org_id", profile.org_id!)
      .eq("active", true),
    supabase
      .from("recipients")
      .select("id", { count: "exact", head: true })
      .eq("org_id", profile.org_id!),
    supabase
      .from("articles")
      .select("id", { count: "exact", head: true })
      .eq("org_id", profile.org_id!),
    supabase
      .from("target_companies")
      .select("id", { count: "exact", head: true })
      .eq("org_id", profile.org_id!),
  ]);

  return (
    <>
      <h1>대시보드</h1>
      <p className="muted">안녕하세요, {profile.name || profile.email} 님.</p>
      <div className="grid">
        <div className="card">
          <h3>활성 키워드</h3>
          <div className="stat-num">{activeKeywords ?? 0}</div>
          <Link href="/settings/keywords" className="small">키워드 관리 →</Link>
        </div>
        <div className="card">
          <h3>브리핑 수신자</h3>
          <div className="stat-num">{recipientCount ?? 0}</div>
          <Link href="/settings/recipients" className="small">수신자 관리 →</Link>
        </div>
        <div className="card">
          <h3>수집 기사</h3>
          <div className="stat-num">{articleCount ?? 0}</div>
          <Link href="/articles" className="small">기사 목록 보기 →</Link>
        </div>
        <div className="card">
          <h3>타겟 회사</h3>
          <div className="stat-num">{targetCount ?? 0}</div>
          <Link href="/targets" className="small">타겟 회사 DB →</Link>
        </div>
      </div>
    </>
  );
}

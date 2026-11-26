import Link from "next/link";
import ActionForm from "@/components/ActionForm";
import { signIn } from "@/app/actions/auth";

const ERRORS: Record<string, string> = {
  link_expired: "링크가 만료되었거나 이미 사용되었습니다. 비밀번호 찾기를 다시 진행해 주세요.",
  no_profile: "계정 정보가 없습니다. 관리자에게 문의해 주세요.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  return (
    <main className="auth-wrap">
      <div className="card auth-card">
        <h1 className="brand">News Intel</h1>
        <p className="muted">마케팅 뉴스 인텔리전스 플랫폼</p>
        {error && ERRORS[error] && <p className="msg msg-error">{ERRORS[error]}</p>}
        <ActionForm action={signIn} submitLabel="로그인">
          <label>
            이메일
            <input name="email" type="email" autoComplete="email" required />
          </label>
          <label>
            비밀번호
            <input name="password" type="password" autoComplete="current-password" required />
          </label>
        </ActionForm>
        <p className="auth-links">
          <Link href="/forgot-password">비밀번호를 잊으셨나요?</Link>
        </p>
        <p className="muted small">계정은 소속 회사 관리자가 등록합니다.</p>
      </div>
    </main>
  );
}

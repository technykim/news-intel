import Link from "next/link";
import ActionForm from "@/components/ActionForm";
import { requestPasswordReset } from "@/app/actions/auth";

export default function ForgotPasswordPage() {
  return (
    <main className="auth-wrap">
      <div className="card auth-card">
        <h1>비밀번호 찾기</h1>
        <p className="muted">가입한 이메일로 비밀번호 재설정 링크를 보내드립니다.</p>
        <ActionForm action={requestPasswordReset} submitLabel="재설정 링크 받기">
          <label>
            이메일
            <input name="email" type="email" autoComplete="email" required />
          </label>
        </ActionForm>
        <p className="auth-links">
          <Link href="/login">로그인으로 돌아가기</Link>
        </p>
      </div>
    </main>
  );
}

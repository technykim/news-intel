import ActionForm from "@/components/ActionForm";
import { setPassword } from "@/app/actions/auth";
import { requireProfile } from "@/lib/auth";

export default async function SetPasswordPage() {
  const profile = await requireProfile();
  return (
    <main className="auth-wrap">
      <div className="card auth-card">
        <h1>{profile.password_set ? "비밀번호 변경" : "비밀번호 설정"}</h1>
        <p className="muted">
          {profile.email}
          {profile.organizations?.name ? ` · ${profile.organizations.name}` : ""}
        </p>
        <ActionForm action={setPassword} submitLabel="저장">
          <label>
            새 비밀번호 (8자 이상)
            <input name="password" type="password" autoComplete="new-password" minLength={8} required />
          </label>
          <label>
            비밀번호 확인
            <input name="confirm" type="password" autoComplete="new-password" minLength={8} required />
          </label>
        </ActionForm>
      </div>
    </main>
  );
}

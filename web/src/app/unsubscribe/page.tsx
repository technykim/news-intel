import { createAdminClient } from "@/lib/supabase/admin";
import { verifyUnsubscribe } from "@/lib/resend";

export default async function UnsubscribePage({
  searchParams,
}: {
  searchParams: Promise<{ org?: string; email?: string; sig?: string }>;
}) {
  const { org = "", email = "", sig = "" } = await searchParams;
  const cleanedEmail = email.trim().toLowerCase();
  const valid = verifyUnsubscribe(org, cleanedEmail, sig);

  if (valid) {
    const admin = createAdminClient();
    await Promise.all([
      admin
        .from("unsubscribes")
        .upsert({ org_id: org, email: cleanedEmail }, { onConflict: "org_id,email" }),
      admin
        .from("contacts")
        .update({ consent: "refused" })
        .eq("org_id", org)
        .eq("email", cleanedEmail),
    ]);
  }

  return (
    <main className="auth-wrap">
      <div className="card auth-card">
        <h1>{valid ? "수신거부 완료" : "잘못된 요청"}</h1>
        {valid ? (
          <p className="muted">
            <strong>{cleanedEmail}</strong> 주소의 마케팅 메일 수신거부가 처리되었습니다. 이후 해당 발신자로부터 광고성 메일이 발송되지 않습니다.
          </p>
        ) : (
          <p className="msg msg-error">수신거부 링크가 유효하지 않습니다.</p>
        )}
      </div>
    </main>
  );
}

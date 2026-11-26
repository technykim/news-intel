import "server-only";
import crypto from "crypto";

function hmacSecret() {
  const secret = process.env.UNSUBSCRIBE_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!secret) throw new Error("Missing signing secret");
  return secret;
}

export function signUnsubscribe(orgId: string, email: string): string {
  return crypto
    .createHmac("sha256", hmacSecret())
    .update(`${orgId}:${email.toLowerCase()}`)
    .digest("hex");
}

export function verifyUnsubscribe(orgId: string, email: string, sig: string): boolean {
  if (!orgId || !email || !sig) return false;
  const expected = signUnsubscribe(orgId, email);
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(sig, "utf8");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export async function sendResendEmail(params: {
  to: string | string[];
  subject: string;
  html: string;
  attachments?: { filename: string; content: string }[];
}): Promise<{ ok: boolean; error?: string }> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.RESEND_FROM_EMAIL?.trim();
  if (!apiKey || !from) {
    return { ok: false, error: "RESEND_API_KEY 또는 RESEND_FROM_EMAIL 환경변수가 설정되지 않았습니다." };
  }

  const recipients = Array.isArray(params.to) ? params.to : [params.to];
  if (!recipients.length) return { ok: false, error: "수신자가 없습니다." };

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: recipients,
      subject: params.subject,
      html: params.html,
      ...(params.attachments?.length ? { attachments: params.attachments } : {}),
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    return { ok: false, error: `Resend ${res.status}: ${text.slice(0, 200)}` };
  }
  return { ok: true };
}

"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/browser";

/**
 * Handles all Supabase email link formats:
 *  - PKCE: ?code=...
 *  - Token hash: ?token_hash=...&type=...
 *  - Implicit hash fragment (default for inviteUserByEmail): #access_token=...&refresh_token=...
 */
export default function AuthCallbackPage() {
  const router = useRouter();
  const [message, setMessage] = useState("인증 확인 중입니다...");

  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const url = new URL(window.location.href);
      const nextParam = url.searchParams.get("next") ?? "/set-password";
      const next = nextParam.startsWith("/") ? nextParam : "/set-password";

      const code = url.searchParams.get("code");
      const tokenHash = url.searchParams.get("token_hash");
      const type = url.searchParams.get("type") as EmailOtpType | null;
      const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
      const accessToken = hashParams.get("access_token");
      const refreshToken = hashParams.get("refresh_token");

      let ok = false;
      if (code) {
        ok = !(await supabase.auth.exchangeCodeForSession(code)).error;
      } else if (tokenHash && type) {
        ok = !(await supabase.auth.verifyOtp({ type, token_hash: tokenHash })).error;
      } else if (accessToken && refreshToken) {
        ok = !(
          await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          })
        ).error;
      } else {
        const { data } = await supabase.auth.getUser();
        ok = !!data.user;
      }

      if (ok) {
        router.replace(next);
      } else {
        setMessage("링크가 만료되었거나 유효하지 않습니다. 로그인 페이지로 이동합니다...");
        setTimeout(() => router.replace("/login?error=link_expired"), 1500);
      }
    })();
  }, [router]);

  return (
    <main className="auth-wrap">
      <div className="card auth-card">
        <h1>News Intel</h1>
        <p className="muted">{message}</p>
      </div>
    </main>
  );
}

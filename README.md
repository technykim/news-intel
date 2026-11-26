# News Intel — 마케팅 뉴스 인텔리전스 SaaS

**Vercel + Supabase**만으로 동작하는 다중 고객사(Multi-tenant) 마케팅 뉴스 수집·AI 타겟 기업 분석·승인 기반 마케팅 발송 솔루션입니다.

## 프로젝트 구조
- `web/` — Next.js 16 웹앱 + Vercel Cron 일일 수집·AI 분석·브리핑 API (`/api/cron/daily-briefing`)
- `supabase/migrations/0001_init.sql` — Postgres 스키마 및 고객사별 RLS 정책

## 배포 및 설정 순서

### 1. Supabase 설정
1. Supabase 프로젝트 생성 (Seoul 리전 권장)
2. SQL Editor에서 `supabase/migrations/0001_init.sql` 실행
3. **Authentication > URL Configuration**에서 Redirect URL 추가:
   - 로컬: `http://localhost:3000/auth/confirm`
   - 운영: `https://YOUR-DOMAIN/auth/confirm`
4. **Authentication > Users**에서 플랫폼 관리자 계정 생성 후 `supabase/bootstrap_platform_admin.sql` 실행

### 2. Vercel 배포 (웹앱 + 매일 08:00 KST 자동 수집)
1. [vercel.com/new](https://vercel.com/new)에서 이 저장소 연결
2. **Root Directory**를 **`web`**으로 지정 (`web/vercel.json`의 Cron 설정이 자동 인식됩니다)
3. **Environment Variables** 등록 (`web/.env.example` 참고):
   - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
   - `NEXT_PUBLIC_SITE_URL` (배포된 Vercel 도메인)
   - `GEMINI_API_KEY` (선택: `GEMINI_MODEL=gemini-2.5-flash`)
   - `RESEND_API_KEY`, `RESEND_FROM_EMAIL`
   - `CRON_SECRET` (임의의 긴 문자열 — Vercel Cron 호출 인증용)

### 3. 로컬 실행
```powershell
cd web
copy .env.example .env.local
npm.cmd run dev
```
대시보드의 **지금 바로 수집·분석 실행** 버튼으로 스케줄을 기다리지 않고 즉시 수집을 테스트할 수 있습니다.

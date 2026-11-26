# News Intel — 마케팅 뉴스 인텔리전스 SaaS

다중 고객사(Multi-tenant) 마케팅 뉴스 수집·AI 타겟 기업 분석·승인 기반 마케팅 발송 솔루션입니다.

## 프로젝트 구조
- `web/` — Next.js 16 웹앱 (Vercel 배포)
- `worker/` — Python 일일 뉴스 수집기 + Gemini AI 기사 분석 + Resend 브리핑 메일
- `supabase/migrations/0001_init.sql` — Postgres 스키마 및 고객사별 RLS 정책
- `.github/workflows/daily_briefing.yml` — 매일 08:00 KST 자동 실행 스케줄러

## 빠른 시작

### 1. Supabase 설정
1. Supabase 프로젝트 생성 (Seoul 리전 권장)
2. SQL Editor에서 `supabase/migrations/0001_init.sql` 실행
3. **Authentication > URL Configuration**에서 Redirect URL 추가:
   - 로컬: `http://localhost:3000/auth/confirm`
   - 운영: `https://YOUR-DOMAIN/auth/confirm`
4. **Authentication > Users**에서 플랫폼 관리자 계정 생성 후 `supabase/bootstrap_platform_admin.sql` 실행

### 2. 웹앱 (`web/`) 실행 및 Vercel 배포
1. `web/.env.example`을 복사해 `web/.env.local` 작성
2. 로컬 실행:
   ```powershell
   cd web
   npm.cmd run dev
   ```
3. **Vercel 배포**: GitHub 저장소 연결 시 **Root Directory**를 `web`으로 지정하고 `.env.example`의 환경변수를 등록 (`NEXT_PUBLIC_SITE_URL`을 운영 도메인으로 설정).

### 3. 수집기 (`worker/`) 및 GitHub Actions
1. 로컬 테스트:
   ```powershell
   cd worker
   pip install -r requirements.txt
   copy .env.example .env
   python main.py --skip-email
   ```
2. GitHub 저장소 **Settings > Secrets and variables > Actions** 등록:
   - **Secrets**: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `GEMINI_API_KEY`, `RESEND_API_KEY`, `RESEND_FROM_EMAIL`
   - **Variables**: `WEB_APP_URL` (운영 Vercel 주소), `GEMINI_MODEL` (선택, 기본 `gemini-2.5-flash`)

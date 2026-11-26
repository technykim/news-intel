import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "News Intel — 마케팅 뉴스 인텔리전스",
  description: "키워드 뉴스 수집, AI 기업 분석, 승인 기반 마케팅 발송",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}

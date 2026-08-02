import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "장기 아레나",
  description: "Janggi Arena — 3D 웹 장기 게임",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <head>
        {/*
          Pretendard — CLAUDE.md 3절이 금지한 "외부 에셋"의 유일한 예외이자
          docs/PRD.md 4절이 타이틀 로고에 지정한 서체. 동적 서브셋 CSS라
          화면에 실제로 쓰인 글자 범위만 내려받는다. 실패해도 시스템 고딕으로
          폴백되므로 렌더를 막지 않는다.
        */}
        <link rel="preconnect" href="https://cdn.jsdelivr.net" />
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard-dynamic-subset.min.css"
        />
      </head>
      <body className="antialiased">{children}</body>
    </html>
  );
}

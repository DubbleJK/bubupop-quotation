"use client";

import { PORTAL_URL } from "@/lib/portalUrl";

const idle = "rounded-full border border-slate-300 bg-white px-3 py-2 text-slate-700";
const active = "rounded-full bg-slate-900 px-3 py-2 text-white";

export function QuoteHeader({
  current,
  role,
  onNewQuote,
  onLogin,
}: {
  current: "quote" | "quotes" | "admin";
  role: "admin" | "staff" | null;
  onNewQuote?: () => void;
  onLogin?: () => void;
}) {
  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-4 py-3">
        <h1 className="mr-auto text-base font-semibold text-slate-900 sm:text-lg">부부피오피 내부 견적</h1>
        <nav className="flex flex-wrap items-center gap-2 text-sm">
          <a className={current === "quote" ? active : idle} href="/">견적 계산</a>
          <a className={current === "quotes" ? active : idle} href="/quotes">견적 기록</a>
          {role === "admin" && <a className={current === "admin" ? active : idle} href="/admin">관리자 설정</a>}
          {role == null && onLogin && <button type="button" className={idle} onClick={onLogin}>관리자 로그인</button>}
          <a className={idle} href={PORTAL_URL}>도구 모음</a>
        </nav>
        {onNewQuote && <button type="button" className="rounded-full bg-blue-700 px-4 py-2 text-sm font-semibold text-white" onClick={onNewQuote}>새 견적</button>}
      </div>
    </header>
  );
}

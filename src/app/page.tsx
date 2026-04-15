"use client";

import { useState, useEffect, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { configProvider } from "@/lib/config";
import type { AppConfig } from "@/lib/config";
import { ADMIN_SESSION_KEY } from "@/lib/config/storageKeys";
import { PORTAL_URL } from "@/lib/portalUrl";

const productBtnClass =
  "flex items-center justify-center rounded-lg border border-slate-200 bg-white px-3 py-3 text-center text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 active:scale-[0.99]";

/**
 * 첫 화면
 * - 견적 품목을 버튼으로 바로 선택 → /quote?product=
 * - 관리자: 로그인 버튼 클릭 시 PIN 입력 영역 표시
 */
export default function Home() {
  const router = useRouter();
  const [config, setConfig] = useState<AppConfig>(() => configProvider.getInitialConfig());
  const [adminPin, setAdminPin] = useState("");
  const [adminError, setAdminError] = useState("");
  const [adminLoginOpen, setAdminLoginOpen] = useState(false);

  useEffect(() => {
    configProvider.getAllConfig().then(setConfig);
  }, []);

  const handleAdminLogin = (e: FormEvent) => {
    e.preventDefault();
    setAdminError("");
    if (adminPin === config.settings.loginPin) {
      if (typeof window !== "undefined") {
        localStorage.setItem(ADMIN_SESSION_KEY, "1");
      }
      router.push("/admin");
    } else {
      setAdminError("PIN이 올바르지 않습니다.");
    }
  };

  const closeAdminLogin = () => {
    setAdminLoginOpen(false);
    setAdminPin("");
    setAdminError("");
  };

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col items-center justify-center p-4 relative">
      <a
        href={PORTAL_URL}
        target="_self"
        rel="noopener noreferrer"
        className="absolute top-4 left-4 inline-flex items-center justify-center px-4 py-2 rounded-full text-sm font-medium bg-slate-700 text-white hover:bg-slate-800 transition-colors shadow-sm"
      >
        HOME
      </a>
      <h1 className="text-2xl font-bold text-slate-800 mb-1 text-center">인쇄 견적 · 주문</h1>
      <p className="text-sm text-slate-500 mb-4 text-center max-w-md">견적할 품목을 선택하면 바로 계산 화면으로 이동합니다.</p>

      <div className="w-full max-w-2xl space-y-5">
        <section className="bg-white border border-slate-200 rounded-xl p-4">
          <h2 className="text-sm font-semibold text-slate-700 mb-3">견적 품목 선택</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {config.products.map((p) => (
              <Link key={p.id} href={`/quote?product=${encodeURIComponent(p.id)}`} className={productBtnClass}>
                {p.label}
              </Link>
            ))}
          </div>
        </section>

        <section className="bg-white border border-slate-200 rounded-xl p-4">
          <h2 className="text-sm font-semibold text-slate-700">관리자</h2>
          <p className="text-xs text-slate-500 mt-1 mb-4">원가·마진률 확인 및 수정</p>

          {!adminLoginOpen ? (
            <button
              type="button"
              onClick={() => setAdminLoginOpen(true)}
              className="w-full bg-slate-600 text-white py-2.5 rounded-lg text-sm font-semibold hover:bg-slate-700 transition"
            >
              관리자 페이지 로그인
            </button>
          ) : (
            <form onSubmit={handleAdminLogin} className="space-y-3">
              <div>
                <label htmlFor="admin-pin" className="block text-xs font-medium text-slate-600 mb-1">
                  4자리 PIN
                </label>
                <input
                  id="admin-pin"
                  type="password"
                  inputMode="numeric"
                  maxLength={4}
                  value={adminPin}
                  onChange={(e) => setAdminPin(e.target.value.replace(/\D/g, ""))}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2.5 text-center text-lg tracking-[0.4em] font-mono"
                  placeholder="••••"
                  autoFocus
                />
              </div>
              {adminError && <p className="text-sm text-red-600">{adminError}</p>}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={closeAdminLogin}
                  className="flex-1 border border-slate-300 bg-white text-slate-700 py-2.5 rounded-lg text-sm font-medium hover:bg-slate-50"
                >
                  취소
                </button>
                <button
                  type="submit"
                  className="flex-1 bg-slate-600 text-white py-2.5 rounded-lg text-sm font-semibold hover:bg-slate-700"
                >
                  로그인
                </button>
              </div>
            </form>
          )}
        </section>
      </div>
    </div>
  );
}

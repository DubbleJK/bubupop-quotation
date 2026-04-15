"use client";

import { useState, useEffect, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { configProvider } from "@/lib/config";
import type { AppConfig } from "@/lib/config";
import { ADMIN_SESSION_KEY } from "@/lib/config/storageKeys";
import { PORTAL_URL } from "@/lib/portalUrl";

/**
 * 첫 화면 (마인드맵 기준)
 * - 주문종류 선택 → 견적 계산 페이지 (일반, 로그인 없음)
 * - 4자리 PIN 로그인 → 관리자 페이지 (원가·마진률 확인 및 수정)
 */
export default function Home() {
  const router = useRouter();
  const [config, setConfig] = useState<AppConfig>(() => configProvider.getInitialConfig());
  const [adminPin, setAdminPin] = useState("");
  const [adminError, setAdminError] = useState("");

  useEffect(() => {
    configProvider.getAllConfig().then(setConfig);
  }, []);

  const handleAdminLogin = (e: FormEvent) => {
    e.preventDefault();
    setAdminError("");
    if (!config) return;
    if (adminPin === config.settings.loginPin) {
      if (typeof window !== "undefined") {
        localStorage.setItem(ADMIN_SESSION_KEY, "1");
      }
      router.push("/admin");
    } else {
      setAdminError("PIN이 올바르지 않습니다.");
    }
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
      <h1 className="text-2xl font-bold text-slate-800 mb-8">인쇄 견적 · 주문</h1>

      <div className="w-full max-w-sm space-y-6">
        {/* 주문종류 → 견적 계산 (일반 페이지) */}
        <Link
          href="/quote"
          className="block w-full bg-white border-2 border-slate-200 rounded-xl p-6 text-center hover:border-blue-400 hover:bg-blue-50/50 transition"
        >
          <span className="text-lg font-semibold text-slate-800">주문종류 선택</span>
          <p className="text-sm text-slate-500 mt-1">견적 계산만 가능</p>
        </Link>

        {/* 관리자: 4자리 PIN 입력 → 관리자 페이지 */}
        <div className="bg-white border border-slate-200 rounded-xl p-6">
          <h2 className="text-sm font-semibold text-slate-700 mb-2">관리자</h2>
          <p className="text-xs text-slate-500 mb-3">원가·마진률 확인 및 수정</p>
          <form onSubmit={handleAdminLogin}>
            <input
              type="password"
              inputMode="numeric"
              maxLength={4}
              value={adminPin}
              onChange={(e) => setAdminPin(e.target.value.replace(/\D/g, ""))}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-center tracking-widest"
              placeholder="4자리 PIN"
            />
            {adminError && <p className="mt-2 text-sm text-red-600">{adminError}</p>}
            <button
              type="submit"
              className="mt-3 w-full bg-slate-700 text-white py-2 rounded-lg text-sm font-medium hover:bg-slate-800"
            >
              관리자 페이지 로그인
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

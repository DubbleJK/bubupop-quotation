"use client";

import { useState, useEffect, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { configProvider, describeQuoteSource } from "@/lib/config";
import type { AppConfig } from "@/lib/config";
import { CustomerMenuList } from "@/components/CustomerMenuList";
import { defaultPublicCatalog, type PublicCatalog, type PublicMenuItem } from "@/lib/cost/publicCatalog";
import { PORTAL_URL } from "@/lib/portalUrl";

/**
 * 첫 화면
 * - 견적 품목을 버튼으로 바로 선택 → /quote?product=
 * - 관리자: 로그인 버튼 클릭 시 PIN 입력 영역 표시
 */
function allItems(source: PublicCatalog): PublicMenuItem[] {
  return [...source.groups.flatMap((group) => group.products), ...source.ungrouped];
}

function FavoriteRow({ catalog }: { catalog: PublicCatalog }) {
  const favorites = allItems(catalog).filter((item) => item.favorite);
  if (favorites.length === 0) return null;
  return (
    <div className="mb-3">
      <p className="mb-1 text-xs text-slate-500">자주 사용하는 상품</p>
      <div className="flex flex-wrap gap-2">
        {favorites.map((item) => <a key={item.id} href={item.href} className="rounded-full border border-slate-300 px-3 py-1 text-sm text-slate-700">{item.label}</a>)}
      </div>
    </div>
  );
}

function filterCatalog(source: PublicCatalog, query: string, groupId: string): PublicCatalog {
  const text = query.trim();
  const match = (item: PublicMenuItem) => text === "" || item.label.includes(text) || (item.description ?? "").includes(text);
  const groups = source.groups
    .filter((group) => groupId === "all" || group.id === groupId)
    .map((group) => ({ ...group, products: group.products.filter(match) }))
    .filter((group) => group.products.length > 0);
  const ungrouped = groupId === "all" ? source.ungrouped.filter(match) : [];
  return { flat: source.flat && groupId === "all", groups, ungrouped };
}

export default function Home() {
  const router = useRouter();
  const [config, setConfig] = useState<AppConfig>(() => configProvider.getInitialConfig());
  const [configNote, setConfigNote] = useState("가격 설정을 확인하는 중입니다.");
  const [adminPin, setAdminPin] = useState("");
  const [adminError, setAdminError] = useState("");
  const [adminLoginOpen, setAdminLoginOpen] = useState(false);
  const [catalog, setCatalog] = useState<PublicCatalog | null>(null);
  const [query, setQuery] = useState("");
  const [groupId, setGroupId] = useState("all");

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/catalog")
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error("catalog"))))
      .then((data: { catalog?: PublicCatalog }) => {
        if (!cancelled && data.catalog) setCatalog(data.catalog);
      })
      .catch(() => {
        if (!cancelled) setCatalog(defaultPublicCatalog());
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    configProvider.loadQuoteConfig().then((result) => {
      if (cancelled) return;
      if (result.ready) {
        setConfig(result.config);
        setConfigNote(describeQuoteSource(result));
      } else {
        setConfig(configProvider.getInitialConfig());
        setConfigNote("서버 설정을 확인하지 못했습니다. 코드 기본 품목만 표시합니다.");
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleAdminLogin = async (e: FormEvent) => {
    e.preventDefault();
    setAdminError("");
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin: adminPin }),
      });
      if (!res.ok) {
        setAdminError(
          res.status === 503 ? "서버 세션 설정을 확인하지 못했습니다." : "PIN이 올바르지 않습니다."
        );
        return;
      }
      router.push("/admin");
    } catch {
      setAdminError("로그인 요청에 실패했습니다.");
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
      <h1 className="text-2xl font-bold text-slate-800 mb-1 text-center">부부피오피 내부 견적</h1>
      <p className="text-sm text-slate-500 mb-1 text-center max-w-md">품목을 고르고 규격과 수량을 입력하면 같은 원가로 견적을 냅니다.</p>
      <div className="mb-4 flex flex-wrap justify-center gap-2 text-sm">
        <a className="rounded-full bg-blue-700 px-3 py-1.5 text-white" href="/">견적 계산</a>
        <a className="rounded-full border border-slate-300 bg-white px-3 py-1.5 text-slate-700" href="/quotes">견적 기록</a>
        <a className="rounded-full border border-slate-300 bg-white px-3 py-1.5 text-slate-700" href="/admin">관리자 설정</a>
      </div>
      <p className="text-xs text-slate-500 mb-4 text-center max-w-md">{configNote}</p>

      <div className="w-full max-w-2xl space-y-5">
        <section className="bg-white border border-slate-200 rounded-xl p-4">
          <h2 className="text-sm font-semibold text-slate-700 mb-3">견적 품목 선택</h2>
          <div className="mb-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
            <input className="border border-slate-300 rounded-lg px-3 py-2" placeholder="상품명 검색" value={query} onChange={(e) => setQuery(e.target.value)} />
            <select className="border border-slate-300 rounded-lg px-3 py-2" value={groupId} onChange={(e) => setGroupId(e.target.value)}>
              <option value="all">품목 그룹 전체</option>
              {catalog?.groups.map((group) => <option key={group.id} value={group.id}>{group.label}</option>)}
            </select>
          </div>
          {catalog && <FavoriteRow catalog={catalog} />}
          {catalog ? <CustomerMenuList catalog={filterCatalog(catalog, query, groupId)} /> : <p className="text-sm text-slate-500">품목을 불러오는 중입니다.</p>}
        </section>

        <section className="bg-white border border-slate-200 rounded-xl p-4">
          <h2 className="text-sm font-semibold text-slate-700">관리자 설정</h2>
          <p className="text-xs text-slate-500 mt-1 mb-4">원자재, 공정, 최소 판매금액은 관리자 로그인 후 바꿉니다.</p>

          {!adminLoginOpen ? (
            <button
              type="button"
              onClick={() => setAdminLoginOpen(true)}
              className="w-full bg-slate-600 text-white py-2.5 rounded-lg text-sm font-semibold hover:bg-slate-700 transition"
            >
              관리자 설정 로그인
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

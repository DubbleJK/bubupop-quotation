"use client";

import { useState, useEffect, type FormEvent } from "react";

const STORAGE_KEY = "quotation_staff_session";

export interface LoginGateProps {
  expectedPin: string;
  onLogin: () => void;
  children: React.ReactNode;
}

export function LoginGate({ expectedPin, onLogin, children }: LoginGateProps) {
  const [mounted, setMounted] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === "1") {
      setAuthenticated(true);
      onLogin();
    }
  }, [mounted, onLogin]);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    setError("");
    if (pin === expectedPin) {
      localStorage.setItem(STORAGE_KEY, "1");
      setAuthenticated(true);
      onLogin();
    } else {
      setError("PIN이 올바르지 않습니다.");
    }
  };

  if (!mounted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-100">
        <p className="text-slate-500">로딩 중...</p>
      </div>
    );
  }

  if (!authenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-100 p-4">
        <div className="bg-white rounded-xl shadow-md p-6 w-full max-w-xs">
          <h1 className="text-lg font-semibold text-slate-800 mb-2">직원 로그인</h1>
          <p className="text-sm text-slate-500 mb-4">4자리 PIN을 입력하세요.</p>
          <form onSubmit={handleSubmit}>
            <input
              type="password"
              inputMode="numeric"
              maxLength={4}
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-center text-lg tracking-widest"
              placeholder="••••"
              autoFocus
            />
            {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
            <button
              type="submit"
              className="mt-4 w-full bg-blue-600 text-white py-2 rounded-lg font-medium hover:bg-blue-700"
            >
              로그인
            </button>
          </form>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

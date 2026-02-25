import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "내부 견적 앱",
  description: "직원용 견적 계산",
  manifest: "/manifest.json",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body className="antialiased min-h-screen">
        {children}
      </body>
    </html>
  );
}

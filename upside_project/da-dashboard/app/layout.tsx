import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Header from "./components/Header";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "BONDA — DA Security Dashboard",
  description: "EthereumDA · EigenDA · Celestia · Avail. Liveness, Spec vs Reality, Threat Modeling.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <Header />
        <main className="flex-1 max-w-[1400px] mx-auto w-full px-6 py-8">
          {children}
        </main>
        <footer className="border-t border-card-border py-4 text-center text-xs text-muted">
          BONDA · 실시간 probe 데이터 기반 · 투자 권유 아님
        </footer>
        {/* (note: BONDA / Liveness / Spec vs Reality / Threat Modeling 같은 페이지 키워드는 영문, 본문은 한글 정책) */}
      </body>
    </html>
  );
}

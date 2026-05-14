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
  title: "DA Watch — Data Availability Monitor",
  description: "Real-time monitoring dashboard for EthereumDA, EigenDA, Celestia, and Avail. Spec vs Reality.",
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
          DA Watch — Built with live probe data. Not financial advice.
        </footer>
      </body>
    </html>
  );
}

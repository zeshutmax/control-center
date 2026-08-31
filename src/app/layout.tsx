import type { Metadata } from "next";
import { Big_Shoulders, IBM_Plex_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const display = Big_Shoulders({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-big-shoulders",
});

const mono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-plex-mono",
});

export const metadata: Metadata = {
  title: "Control Center",
  description: "Registry, stats, and agent interface for every project I run.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${mono.variable}`}>
      <body className="min-h-screen">
        <header className="border-b border-line bg-panel/80 backdrop-blur-sm">
          <div className="mx-auto flex max-w-6xl items-baseline justify-between px-5 py-3">
            <Link href="/" className="group flex items-baseline gap-3">
              <span className="font-display text-2xl font-bold uppercase tracking-[0.18em] text-ink group-hover:text-accent">
                Control Center
              </span>
              <span className="hidden text-[11px] text-mute sm:inline">ops://zeshut</span>
            </Link>
            <nav className="flex items-baseline gap-5 text-[11px] uppercase tracking-wider text-dim">
              <Link href="/" className="hover:text-accent">
                Registry
              </Link>
              <a
                href="https://github.com"
                target="_blank"
                rel="noreferrer"
                className="hover:text-accent"
              >
                GitHub ↗
              </a>
            </nav>
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-5 py-8">{children}</main>
        <footer className="border-t border-line">
          <div className="mx-auto flex max-w-6xl flex-wrap gap-x-6 gap-y-1 px-5 py-4 text-[11px] text-mute">
            <span>
              agent endpoint: <code className="text-dim">/api/mcp</code>
            </span>
            <span>
              pixel: <code className="text-dim">/px.js</code>
            </span>
            <span>read-only · phase 1</span>
          </div>
        </footer>
      </body>
    </html>
  );
}

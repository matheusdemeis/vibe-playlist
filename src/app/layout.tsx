import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Link from "next/link";
import { AppHeader } from "@/components/AppHeader";
import { Icon } from "@/components/ui/Icon";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "VibePlay",
  description:
    "Find the soundtrack to your mood. Explore tracks, shape your mix, and save your next playlist to Spotify with VibePlay.",
  icons: {
    icon: "/icon.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <AppHeader />
        <div className="site-content">{children}</div>
        <footer className="site-footer shell">
          <div>
            <Link className="footer-brand" href="/">
              vibeplay.
            </Link>
            <p>A little more feeling. A little less searching.</p>
          </div>
          <nav aria-label="Footer navigation">
            <Link href="/generate">Create a playlist</Link>
            <Link href="/vibe/history">Your history</Link>
            <a
              href="https://open.spotify.com"
              target="_blank"
              rel="noopener noreferrer"
            >
              Music from Spotify <Icon name="external" width="14" height="14" />
            </a>
          </nav>
          <span className="footer-note">
            An independent music discovery project.
          </span>
        </footer>
      </body>
    </html>
  );
}

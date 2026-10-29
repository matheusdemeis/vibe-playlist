"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "@/components/ui/Icon";

export function AppHeader() {
  const pathname = usePathname();
  return (
    <header className="site-header">
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <div className="shell header-inner">
        <Link className="wordmark" href="/" aria-label="VibePlay home">
          <span className="brand-symbol" aria-hidden="true">
            <i />
            <i />
            <i />
            <i />
          </span>
          vibeplay<span className="brand-period">.</span>
        </Link>
        <nav aria-label="Main navigation">
          {[
            { href: "/generate", label: "Create" },
            { href: "/vibe", label: "Mix studio" },
            { href: "/vibe/history", label: "History" },
          ].map(({ href, label }) => {
            const active =
              href === "/vibe"
                ? pathname === href || pathname === "/vibe/results"
                : pathname === href;
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
              >
                {label}
              </Link>
            );
          })}
        </nav>
        <Link className="header-cta" href="/generate">
          Find your vibe <Icon name="arrow" />
        </Link>
      </div>
    </header>
  );
}

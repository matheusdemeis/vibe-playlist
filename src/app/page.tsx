import Link from "next/link";
import { VIBE_OPTIONS } from "@/lib/vibes";

export default function Home() {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[var(--brand-bg)] px-4 py-10">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-80 bg-[var(--brand-glow)]"
      />

      <main className="relative flex w-full max-w-4xl flex-col gap-10 rounded-3xl border border-white/10 bg-[var(--card-bg)] p-6 text-left shadow-2xl shadow-black/50 sm:p-10">
        <section className="space-y-5 text-center sm:space-y-6">
          <h1 className="text-4xl font-semibold tracking-tight text-[var(--text-primary)] sm:text-5xl">
            Vibe Playlist
          </h1>
          <p className="mx-auto max-w-2xl text-sm text-[var(--text-secondary)] sm:text-base">
            Generate Spotify playlists based on mood, artists, or activities.
          </p>
          <Link
            href="/generate"
            className="inline-flex rounded-full bg-[var(--brand-action)] px-6 py-3 text-sm font-semibold text-[var(--brand-bg)] transition-colors hover:bg-[var(--brand-action-hover)]"
          >
            Get Started
          </Link>
        </section>

        <section className="space-y-3 rounded-2xl border border-white/10 bg-[image:var(--gradient-soft)] p-5 sm:p-6">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--text-primary)]">
            How it works
          </h2>
          <ul className="space-y-2 text-sm text-[var(--text-secondary)]">
            <li>Connect Spotify</li>
            <li>Choose a vibe</li>
            <li>Generate playlist</li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--text-primary)]">
            Example vibes
          </h2>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {VIBE_OPTIONS.map((vibe) => (
              <div
                key={vibe.value}
                className="rounded-xl border border-white/10 bg-[var(--surface-elevated)] px-3 py-2 text-sm font-medium text-[var(--text-primary)]"
              >
                {vibe.label}
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}

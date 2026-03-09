import Link from "next/link";
import { VIBE_OPTIONS } from "@/lib/vibes";

export default function Home() {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#12100c] px-4 py-10">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 left-1/2 h-96 w-96 -translate-x-1/2 rounded-full bg-amber-500/20 blur-3xl"
      />

      <main className="relative flex w-full max-w-4xl flex-col gap-10 rounded-3xl border border-zinc-800/90 bg-zinc-950/90 p-6 text-left shadow-2xl shadow-black/50 sm:p-10">
        <section className="space-y-5 text-center sm:space-y-6">
          <h1 className="text-4xl font-semibold tracking-tight text-zinc-50 sm:text-5xl">
            Vibe Playlist
          </h1>
          <p className="mx-auto max-w-2xl text-sm text-zinc-300 sm:text-base">
            Generate Spotify playlists based on mood, artists, or activities.
          </p>
          <Link
            href="/generate"
            className="inline-flex rounded-full bg-emerald-500 px-6 py-3 text-sm font-semibold text-zinc-950 transition-colors hover:bg-emerald-400"
          >
            Get Started
          </Link>
        </section>

        <section className="space-y-3 rounded-2xl border border-amber-300/20 bg-gradient-to-br from-amber-400/10 via-orange-300/5 to-transparent p-5 sm:p-6">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-amber-100">How it works</h2>
          <ul className="space-y-2 text-sm text-zinc-200">
            <li>Connect Spotify</li>
            <li>Choose a vibe</li>
            <li>Generate playlist</li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-100">Example vibes</h2>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {VIBE_OPTIONS.map((vibe) => (
              <div
                key={vibe.value}
                className="rounded-xl border border-zinc-700 bg-zinc-900/70 px-3 py-2 text-sm font-medium text-zinc-200"
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

export default function Home() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50">
      <main className="flex w-full max-w-xl flex-col items-center gap-6 rounded-2xl bg-white p-10 text-center shadow-sm">
        <h1 className="text-3xl font-semibold text-zinc-900">Vibe Playlist</h1>
        <a
          className="rounded-full bg-zinc-900 px-6 py-3 text-white transition-colors hover:bg-zinc-700"
          href="/api/auth/login"
        >
          Connect Spotify
        </a>
      </main>
    </div>
  );
}

export default function VibePage() {
  return (
    <main className="rounded-2xl bg-white p-5 shadow-sm sm:p-8">
      <header className="mb-6 space-y-2">
        <h1 className="text-2xl font-semibold text-zinc-900 sm:text-3xl">Vibe Builder</h1>
        <p className="text-sm text-zinc-600 sm:text-base">
          Build your playlist intent. Generation will be wired in the next step.
        </p>
      </header>

      <section className="space-y-4">
        <div className="rounded-xl border border-zinc-200 p-4 text-sm text-zinc-600">
          Presets, sliders, genres, and options will appear here.
        </div>
        <button
          type="button"
          disabled
          className="w-full rounded-full bg-zinc-300 px-5 py-3 text-sm font-medium text-white sm:w-auto"
        >
          Generate
        </button>
      </section>
    </main>
  );
}

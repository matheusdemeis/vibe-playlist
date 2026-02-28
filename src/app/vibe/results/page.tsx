import Link from "next/link";

export default async function VibeResultsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const display = JSON.stringify(params, null, 2);

  return (
    <main className="rounded-2xl bg-white p-5 shadow-sm sm:p-8">
      <header className="mb-6 space-y-2">
        <h1 className="text-2xl font-semibold text-zinc-900 sm:text-3xl">Vibe Results</h1>
        <p className="text-sm text-zinc-600 sm:text-base">
          Placeholder results state. Real generator integration comes next.
        </p>
      </header>

      <pre className="overflow-x-auto rounded-xl bg-zinc-900 p-4 text-xs text-zinc-100">{display}</pre>

      <Link
        href="/vibe"
        className="mt-5 inline-flex rounded-full bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700"
      >
        Back to Builder
      </Link>
    </main>
  );
}

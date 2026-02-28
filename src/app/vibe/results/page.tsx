import Link from "next/link";
import {
  DEFAULT_VIBE_INPUT,
  TEMPO_OPTIONS,
  buildVibeGeneratorRequest,
  type TempoOption,
  type VibeBuilderInput,
} from "@/lib/vibe-builder";

function readRequestInput(params: Record<string, string | string[] | undefined>): VibeBuilderInput {
  const vibes = parseCommaList(params.vibes);
  const genres = parseCommaList(params.genres);
  const energy = Number(params.energy);
  const valence = Number(params.valence);
  const tempo = params.tempo;
  const trackCount = Number(params.trackCount);
  const explicit = params.explicit;

  return {
    vibes,
    genres,
    energy: Number.isFinite(energy) ? energy : DEFAULT_VIBE_INPUT.energy,
    valence: Number.isFinite(valence) ? valence : DEFAULT_VIBE_INPUT.valence,
    tempo:
      typeof tempo === "string" && TEMPO_OPTIONS.includes(tempo as TempoOption)
        ? (tempo as TempoOption)
        : DEFAULT_VIBE_INPUT.tempo,
    trackCount: Number.isFinite(trackCount) ? trackCount : DEFAULT_VIBE_INPUT.trackCount,
    explicit: explicit === undefined ? DEFAULT_VIBE_INPUT.explicit : explicit === "true",
  };
}

function parseCommaList(value: string | string[] | undefined): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((item) => item.split(",")).filter(Boolean);
  }
  return value?.split(",").filter(Boolean) ?? [];
}

export default async function VibeResultsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const input = readRequestInput(params);

  let display = "";
  let errorMessage: string | null = null;

  try {
    const request = buildVibeGeneratorRequest(input);
    display = JSON.stringify(request, null, 2);
  } catch (error) {
    errorMessage = error instanceof Error ? error.message : "Request validation failed.";
  }

  return (
    <main className="rounded-2xl bg-white p-5 shadow-sm sm:p-8">
      <header className="mb-6 space-y-2">
        <h1 className="text-2xl font-semibold text-zinc-900 sm:text-3xl">Vibe Results</h1>
        <p className="text-sm text-zinc-600 sm:text-base">
          Placeholder results state. Real generator integration comes next.
        </p>
      </header>

      {errorMessage ? (
        <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {errorMessage}
        </p>
      ) : (
        <pre className="overflow-x-auto rounded-xl bg-zinc-900 p-4 text-xs text-zinc-100">
          {display}
        </pre>
      )}

      <Link
        href="/vibe"
        className="mt-5 inline-flex rounded-full bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700"
      >
        Back to Builder
      </Link>
    </main>
  );
}

"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Icon } from "@/components/ui/Icon";
import { SpotifyConnection } from "@/components/vibe/ConnectionCard";
import {
  CURATED_GENRES,
  readVibeBuilderQuery,
  TRACK_COUNT_OPTIONS,
  VIBE_PRESETS,
  validateVibeBuilderInput,
  type VibeBuilderInput,
} from "@/lib/vibe-builder";
import {
  deletePreset,
  listPresets,
  savePreset,
  type Preset,
} from "@/lib/storage/vibe-data";

export default function VibePage() {
  return (
    <Suspense
      fallback={
        <main id="main-content" className="shell page">
          <p role="status">Opening your studio…</p>
        </main>
      }
    >
      <VibeBuilder />
    </Suspense>
  );
}

function VibeBuilder() {
  const params = useSearchParams();
  const router = useRouter();
  const [authMessage] = useState(() =>
    params.has("auth_error")
      ? "Spotify connection was not completed. Your mix settings are preserved; connect above to try again."
      : null,
  );
  const [state, setState] = useState<VibeBuilderInput>(() =>
    readVibeBuilderQuery(new URLSearchParams(params.toString())),
  );
  const [presetName, setPresetName] = useState("");
  const [presets, setPresets] = useState<Preset[]>([]);
  const [presetMessage, setPresetMessage] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  useEffect(() => {
    // Presets are browser-only; hydrate after SSR to keep the initial markup consistent.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPresets(listPresets());
  }, []);
  const [presetError, setPresetError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams();

    if (state.vibes.length > 0) {
      params.set("vibes", state.vibes.join(","));
    }
    if (state.genres.length > 0) {
      params.set("genres", state.genres.join(","));
    }
    params.set("energy", String(state.energy));
    params.set("valence", String(state.valence));
    params.set("tempo", state.tempo);
    params.set("trackCount", String(state.trackCount));
    params.set("explicit", String(state.explicit));

    const query = params.toString();
    const url = query ? `/vibe?${query}` : "/vibe";
    window.history.replaceState(null, "", url);
  }, [state]);

  const toggleSelection = (values: string[], value: string) => {
    if (values.includes(value)) {
      return values.filter((item) => item !== value);
    }
    return [...values, value];
  };

  const handleSavePreset = () => {
    const name = presetName.trim();
    if (!name) {
      setPresetError("Preset name is required.");
      return;
    }

    const validation = validateVibeBuilderInput(state);
    if (!validation.isValid) {
      setPresetError(validation.errors[0] ?? "Preset settings are invalid.");
      return;
    }

    try {
      savePreset(name, state);
      setPresets(listPresets());
      setPresetName("");
      setPresetError(null);
      setPresetMessage(`“${name}” is saved in your presets.`);
    } catch (error) {
      setPresetError(
        error instanceof Error ? error.message : "Could not save preset.",
      );
    }
  };

  const handleApplyPreset = (preset: Preset) => {
    setState(preset.settings);
    setPresetMessage(`“${preset.name}” applied to your mix.`);
    setFormError(null);
  };

  const handleDeletePreset = (presetId: string) => {
    try {
      deletePreset(presetId);
      setPresets(listPresets());
    } catch {
      setPresetError(
        "Could not update presets. Check your browser storage settings.",
      );
    }
  };

  const resultQuery = useMemo(() => {
    const params = new URLSearchParams();
    params.set("vibes", state.vibes.join(","));
    params.set("genres", state.genres.join(","));
    params.set("energy", String(state.energy));
    params.set("valence", String(state.valence));
    params.set("tempo", state.tempo);
    params.set("trackCount", String(state.trackCount));
    params.set("explicit", String(state.explicit));
    return params.toString();
  }, [state]);

  return (
    <main id="main-content" tabIndex={-1} className="shell page">
      <header className="page-heading">
        <span className="eyebrow">A LITTLE MORE ROOM TO PLAY</span>
        <h1>Welcome to your mix studio.</h1>
        <p>
          Blend moods, explore genres, and save the combinations you come back
          to.
        </p>
      </header>
      <SpotifyConnection returnTo={`/vibe?${resultQuery}`} />
      {authMessage && (
        <p role="status" className="notice">
          {authMessage}
        </p>
      )}
      <div className="workspace studio-workspace">
        <form
          className="panel studio-form"
          onSubmit={(event) => {
            event.preventDefault();
            const validation = validateVibeBuilderInput(state);
            if (!validation.isValid) {
              setFormError(validation.errors[0]);
              return;
            }
            router.push(`/vibe/results?${resultQuery}`);
          }}
        >
          <fieldset className="form-section">
            <legend className="eyebrow">01 / FEEL IT OUT</legend>
            <h2>One mood. Or a few.</h2>
            <p>Pick the feelings you want to bring into the mix.</p>
            <div className="chips">
              {VIBE_PRESETS.map((vibe) => (
                <button
                  className="chip"
                  key={vibe}
                  type="button"
                  aria-pressed={state.vibes.includes(vibe)}
                  onClick={() =>
                    setState((prev) => ({
                      ...prev,
                      vibes: toggleSelection(prev.vibes, vibe),
                    }))
                  }
                >
                  {state.vibes.includes(vibe) && (
                    <Icon name="check" width="14" height="14" />
                  )}
                  {vibe}
                </button>
              ))}
            </div>
          </fieldset>
          <fieldset className="form-section">
            <legend className="eyebrow">02 / FIND YOUR SOUND</legend>
            <h2>Add some flavor.</h2>
            <p>Choose genres to guide your search. Mixing is encouraged.</p>
            <div className="chips">
              {CURATED_GENRES.map((genre) => (
                <button
                  className="chip"
                  key={genre}
                  type="button"
                  aria-pressed={state.genres.includes(genre)}
                  onClick={() =>
                    setState((prev) => ({
                      ...prev,
                      genres: toggleSelection(prev.genres, genre),
                    }))
                  }
                >
                  {state.genres.includes(genre) && (
                    <Icon name="check" width="14" height="14" />
                  )}
                  {genre}
                </button>
              ))}
            </div>
          </fieldset>
          <div className="field">
            <label htmlFor="track-count">Playlist length</label>
            <select
              id="track-count"
              value={state.trackCount}
              onChange={(event) =>
                setState((prev) => ({
                  ...prev,
                  trackCount: Number(event.target.value),
                }))
              }
            >
              {![...TRACK_COUNT_OPTIONS].includes(
                state.trackCount as 20 | 30 | 50,
              ) && (
                <option value={state.trackCount}>
                  {state.trackCount} tracks
                </option>
              )}
              {TRACK_COUNT_OPTIONS.map((count) => (
                <option key={count} value={count}>
                  {count} tracks
                </option>
              ))}
            </select>
            <p className="field-hint">
              We’ll look for this many tracks. Available matches may vary.
            </p>
          </div>
          <label className="check-label">
            <input
              type="checkbox"
              checked={state.explicit}
              onChange={(event) =>
                setState((prev) => ({
                  ...prev,
                  explicit: event.target.checked,
                }))
              }
            />
            Include explicit tracks
          </label>
          <p className="unsupported-note">
            Mood and genre guide catalog matches. Precise energy, tempo, and
            emotional analysis aren’t available, so those controls are not
            applied.
          </p>
          {formError && (
            <p role="alert" className="notice notice-error">
              {formError}
            </p>
          )}
          <button className="button button-primary" type="submit">
            <Icon name="spark" />
            Generate Playlist <Icon name="arrow" />
          </button>
        </form>
        <aside className="studio-sidebar" aria-label="Your presets">
          <section className="panel">
            <div className="panel-heading">
              <h2 className="panel-title">Save the feeling.</h2>
              <span className="step-number">{presets.length} / 20</span>
            </div>
            <p className="muted text-xs mb-5">
              Keep this combination for another day.
            </p>
            <form
              className="preset-form"
              onSubmit={(event) => {
                event.preventDefault();
                handleSavePreset();
              }}
            >
              <div className="field">
                <label htmlFor="preset-name">Preset name</label>
                <input
                  id="preset-name"
                  maxLength={100}
                  value={presetName}
                  onChange={(event) => setPresetName(event.target.value)}
                  placeholder="Sunday, on repeat"
                />
              </div>
              <button
                className="button button-secondary button-small"
                type="submit"
              >
                Save Preset <Icon name="check" width="16" height="16" />
              </button>
            </form>
            {presetError && (
              <p role="alert" className="notice notice-error">
                {presetError}
              </p>
            )}
            {presetMessage && (
              <p role="status" className="field-hint">
                {presetMessage}
              </p>
            )}
            {presets.length ? (
              <ul className="preset-list">
                {presets.map((preset) => (
                  <li key={preset.id}>
                    <div>
                      <strong>{preset.name}</strong>
                      <small>
                        {[
                          ...preset.settings.vibes,
                          ...preset.settings.genres,
                        ].join(" · ")}
                      </small>
                    </div>
                    <button
                      className="chip"
                      type="button"
                      onClick={() => handleApplyPreset(preset)}
                      aria-label={`Apply ${preset.name}`}
                    >
                      Apply
                    </button>
                    <button
                      className="icon-button"
                      type="button"
                      onClick={() => handleDeletePreset(preset.id)}
                      aria-label={`Delete ${preset.name}`}
                    >
                      <Icon name="close" width="16" height="16" />
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="preset-empty">
                Your favorite combinations will live here.
              </p>
            )}
            <p className="field-hint">Presets are stored in this browser.</p>
          </section>
          <div className="studio-note">
            <h3>Make room for a surprise.</h3>
            <p>
              Review your tracks before saving. In results, lock a favorite to
              keep it through the next generation.
            </p>
            <Link className="inline-link mt-4" href="/vibe/history">
              Revisit your mixes <Icon name="arrow" />
            </Link>
          </div>
        </aside>
      </div>
    </main>
  );
}

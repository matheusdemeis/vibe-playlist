"use client";

import { useEffect, useId, useRef } from "react";
import { Icon, SpotifyIcon } from "@/components/ui/Icon";

type Props = {
  name: string;
  description: string;
  isPublic: boolean;
  trackCount: number;
  onNameChange: (value: string) => void;
  onDescriptionChange: (value: string) => void;
  onPublicChange: (value: boolean) => void;
  onClose: () => void;
  onSave: () => void;
  isSaving: boolean;
  canSave: boolean;
  locked: boolean;
  error: string | null;
  reconnectUrl: string;
};

// Mounted only while open. Native modal behavior supplies focus containment and an inert background.
export function SavePlaylistDialog(props: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const id = useId();
  useEffect(() => {
    const dialog = dialogRef.current;
    const previous =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    dialog?.showModal();
    (
      dialog?.querySelector<HTMLElement>("input:not(:disabled)") ??
      dialog?.querySelector<HTMLElement>("button:not(:disabled)")
    )?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      dialog?.close();
      document.body.style.overflow = previousOverflow;
      if (previous?.isConnected && !previous.matches(":disabled"))
        previous.focus();
      else
        document
          .querySelector<HTMLElement>("[data-save-confirmation]")
          ?.focus();
    };
  }, []);
  return (
    <dialog
      ref={dialogRef}
      className="save-dialog"
      aria-labelledby={`${id}-title`}
      aria-describedby={`${id}-description`}
      onKeyDown={(event) => {
        if (event.key !== "Tab") return;
        const stops = Array.from(
          event.currentTarget.querySelectorAll<HTMLElement>(
            "button:not(:disabled), a[href], input:not(:disabled), textarea:not(:disabled), select:not(:disabled)",
          ),
        ).filter((element) => element.getClientRects().length > 0);
        const first = stops[0];
        const last = stops[stops.length - 1];
        if (!first) event.preventDefault();
        else if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }}
      onCancel={(event) => {
        event.preventDefault();
        if (!props.isSaving) props.onClose();
      }}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (props.canSave && !props.isSaving) props.onSave();
        }}
      >
        <div className="dialog-heading">
          <span className="eyebrow">
            <SpotifyIcon /> THE FINAL TOUCH
          </span>
          <button
            className="icon-button"
            type="button"
            aria-label="Close save dialog"
            disabled={props.isSaving}
            onClick={props.onClose}
          >
            <Icon name="close" />
          </button>
        </div>
        <h2 id={`${id}-title`}>Make it yours.</h2>
        <p id={`${id}-description`} className="muted">
          Give your {props.trackCount}-track mix a name, then save it to
          Spotify.
        </p>
        <div className="field">
          <label htmlFor={`${id}-name`}>Playlist name</label>
          <input
            id={`${id}-name`}
            required
            maxLength={100}
            value={props.name}
            disabled={props.locked || props.isSaving}
            onChange={(e) => props.onNameChange(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor={`${id}-description-input`}>
            Description <span className="optional">optional</span>
          </label>
          <textarea
            id={`${id}-description-input`}
            maxLength={300}
            rows={3}
            value={props.description}
            disabled={props.locked || props.isSaving}
            onChange={(e) => props.onDescriptionChange(e.target.value)}
          />
        </div>
        <fieldset
          className="visibility-field"
          disabled={props.locked || props.isSaving}
        >
          <legend>Playlist visibility</legend>
          <div className="visibility-options">
            {[false, true].map((isPublic) => (
              <label key={String(isPublic)}>
                <input
                  type="radio"
                  name={`${id}-visibility`}
                  checked={props.isPublic === isPublic}
                  onChange={() => props.onPublicChange(isPublic)}
                />
                <span>
                  <Icon name={isPublic ? "music" : "lock"} />
                  {isPublic ? "Public" : "Private"}
                </span>
              </label>
            ))}
          </div>
          <p className="field-hint">
            {props.isPublic
              ? "Other Spotify listeners can discover this playlist."
              : "Keep this mix off your public Spotify profile."}
          </p>
        </fieldset>
        {props.locked && (
          <p className="field-hint">
            Details are preserved while finishing your existing playlist.
          </p>
        )}
        {props.error && (
          <div className="notice notice-error" role="alert">
            <p>{props.error}</p>
            {/reconnect|connect Spotify/i.test(props.error) && (
              <a className="inline-link" href={props.reconnectUrl}>
                Reconnect Spotify <Icon name="arrow" />
              </a>
            )}
          </div>
        )}
        <div className="dialog-actions">
          <button
            className="button button-secondary"
            type="button"
            disabled={props.isSaving}
            onClick={props.onClose}
          >
            Cancel
          </button>
          <button
            className="button button-primary"
            type="submit"
            disabled={props.isSaving || !props.canSave || !props.name.trim()}
          >
            {props.isSaving ? (
              <>
                <span className="spinner" />
                Saving…
              </>
            ) : (
              <>
                <SpotifyIcon />
                Save Playlist
              </>
            )}
          </button>
        </div>
        {props.isSaving && (
          <p className="field-hint" role="status">
            Saving your mix. Keep this window open until it’s finished.
          </p>
        )}
      </form>
    </dialog>
  );
}

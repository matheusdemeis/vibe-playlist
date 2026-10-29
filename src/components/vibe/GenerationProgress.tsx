export function GenerationProgress() {
  return (
    <div className="generation-progress" role="status" aria-live="polite">
      <div className="progress-heading">
        <span className="equalizer" aria-hidden="true">
          <i />
          <i />
          <i />
          <i />
          <i />
        </span>
        <div>
          <h3>Finding your next favorites</h3>
          <p>Searching Spotify’s catalog for your selection. Hang tight.</p>
        </div>
      </div>
      <div className="progress-line" aria-hidden="true" />
      <div className="skeleton-tracks" aria-hidden="true">
        {[1, 2, 3].map((i) => (
          <div key={i}>
            <span />
            <div>
              <i />
              <i />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

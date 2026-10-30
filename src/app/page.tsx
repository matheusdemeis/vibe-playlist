import Link from "next/link";
import { VIBE_OPTIONS } from "@/lib/vibes";
import { MoodArtwork, MOOD_NOTES } from "@/components/MoodArtwork";
import { Icon, SpotifyIcon } from "@/components/ui/Icon";

export default function Home() {
  return (
    <main id="main-content" tabIndex={-1} className="shell">
      <section className="hero">
        <div className="hero-copy">
          <span className="eyebrow">
            <span className="eyebrow-dot" /> A MIX FOR EVERY VERSION OF YOU
          </span>
          <h1>
            Your mood.
            <br />
            Your music.
            <br />
            <em>Your moment.</em>
          </h1>
          <p>
            For the long way home. The last rep. The doing absolutely nothing.
            Find a Spotify playlist that fits your feeling.
          </p>
          <div className="hero-actions">
            <Link className="button button-primary" href="/generate">
              Create Your Playlist <Icon name="arrow" />
            </Link>
            <a href="#how-it-works">How it works ↗</a>
          </div>
          <div className="hero-caption">
            <SpotifyIcon /> Discover with Spotify. Make it your own.
          </div>
        </div>
        <div className="record-scene" aria-hidden="true">
          <div className="record-halo" />
          <div className="vinyl" />
          <div className="record-sleeve">
            <div className="sleeve-top">
              <span>VIBEPLAY ORIGINAL MIX</span>
              <Icon name="spark" width="16" height="16" />
            </div>
            <div className="sleeve-title">
              GOOD
              <br />
              MUSIC.
              <br />
              <span>
                YOUR
                <br />
                FREQUENCY.
              </span>
            </div>
            <div className="sleeve-orbit" />
            <div className="sleeve-bottom">
              SIDE A — WHATEVER YOU’RE FEELING
            </div>
          </div>
          <div className="record-caption">LESS SCROLLING. MORE FEELING. ↗</div>
        </div>
      </section>
      <div className="landing-divider">
        <span>
          <Icon name="music" width="16" height="16" /> Your mood sets the
          direction
        </span>
        <span>
          <Icon name="sliders" width="16" height="16" /> You make the final call
        </span>
        <span>
          <SpotifyIcon /> Saved straight to Spotify
        </span>
      </div>
      <section className="mood-section" aria-labelledby="moods-heading">
        <div className="section-heading">
          <div>
            <span className="eyebrow">START WITH A FEELING</span>
            <h2 id="moods-heading">What’s your vibe today?</h2>
          </div>
          <p>
            Pick a mood. Add an artist you love.
            <br />
            See where the music takes you.
          </p>
        </div>
        <div className="mood-grid">
          {VIBE_OPTIONS.map((vibe) => (
            <Link
              className="mood-card"
              href={`/generate?vibe=${vibe.value}`}
              key={vibe.value}
            >
              <MoodArtwork mood={vibe.value} />
              <span className="mood-card-copy">
                <strong>{vibe.label}</strong>
                <small>{MOOD_NOTES[vibe.value]}</small>
              </span>
            </Link>
          ))}
        </div>
      </section>
      <section
        className="how-section"
        id="how-it-works"
        aria-labelledby="how-heading"
      >
        <div className="section-heading">
          <div>
            <span className="eyebrow">FROM FEELING TO PLAYLIST</span>
            <h2 id="how-heading">A few choices. A whole new mix.</h2>
          </div>
          <Link className="inline-link" href="/generate">
            Find your soundtrack <Icon name="arrow" />
          </Link>
        </div>
        <div className="how-grid">
          {[
            [
              "01",
              "Set the scene.",
              "Connect Spotify, choose a mood, and add an artist or track to steer the search.",
            ],
            [
              "02",
              "Find your mix.",
              "Explore matches from Spotify’s catalog. Review the tracks and try another mix whenever you like.",
            ],
            [
              "03",
              "Take it with you.",
              "Give your playlist a name and save it to your Spotify account. Your next listen is ready.",
            ],
          ].map(([number, title, description]) => (
            <article className="how-step" key={number}>
              <span>{number} /</span>
              <h3>{title}</h3>
              <p>{description}</p>
            </article>
          ))}
        </div>
      </section>
      <section className="landing-outro">
        <div>
          <h2>There’s a mix for this moment.</h2>
          <p>Let’s find yours.</p>
        </div>
        <Link href="/generate" className="button button-primary">
          Create Your Playlist <Icon name="arrow" />
        </Link>
      </section>
    </main>
  );
}

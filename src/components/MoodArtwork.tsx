import type { VibeKey } from "@/lib/vibes";

export const MOOD_NOTES: Record<VibeKey, string> = {
  chill: "Slow down. Settle in.",
  gym: "One more rep.",
  beach: "Salt air, no plans.",
  nightdrive: "Take the long way.",
  party: "Keep the lights on.",
  snowboarding: "Find your next line.",
};

// Original, code-native artwork keeps mood cards crisp at every size without image downloads.
export function MoodArtwork({
  mood,
  className = "",
}: {
  mood: VibeKey;
  className?: string;
}) {
  return (
    <div
      className={`mood-art mood-art--${mood} ${className}`}
      aria-hidden="true"
    >
      <svg
        viewBox="0 0 240 160"
        fill="none"
        preserveAspectRatio="xMidYMid slice"
      >
        {mood === "chill" && (
          <>
            <circle cx="178" cy="39" r="29" fill="currentColor" opacity=".5" />
            {[55, 78, 101, 124, 147].map((y) => (
              <path
                key={y}
                d={`M-20 ${y}C40 ${y - 50} 85 ${y + 45} 145 ${y}S220 ${y - 40} 270 ${y}`}
                stroke="currentColor"
                strokeWidth="2"
              />
            ))}
          </>
        )}
        {mood === "gym" && (
          <g transform="rotate(-25 120 80)">
            {[30, 65, 100, 135, 170].map((x, i) => (
              <rect
                key={x}
                x={x}
                y={65 - i * 12}
                width="22"
                height={55 + i * 24}
                rx="2"
                fill="currentColor"
                opacity={0.3 + i * 0.15}
              />
            ))}
          </g>
        )}
        {mood === "beach" && (
          <>
            <circle cx="122" cy="65" r="40" fill="currentColor" />
            <path d="M0 104h240" stroke="currentColor" strokeWidth="2" />
            {[116, 128, 140, 152].map((y, i) => (
              <path
                key={y}
                d={`M${30 + i * 12} ${y}h${180 - i * 24}`}
                stroke="currentColor"
                strokeWidth="2"
                opacity={0.7 - i * 0.12}
              />
            ))}
          </>
        )}
        {mood === "nightdrive" && (
          <>
            <circle cx="120" cy="58" r="25" fill="currentColor" opacity=".6" />
            <path
              d="M0 84h240M92 84 20 160M148 84l72 76M118 93l-2 13m-2 12-4 25"
              stroke="currentColor"
              strokeWidth="2"
            />
            {[95, 112, 135, 158].map((y) => (
              <path
                key={y}
                d={`M0 ${y}h240`}
                stroke="currentColor"
                opacity=".2"
              />
            ))}
          </>
        )}
        {mood === "party" && (
          <>
            {[0, 30, 60, 90, 120, 150].map((deg) => (
              <ellipse
                key={deg}
                cx="120"
                cy="80"
                rx="61"
                ry="18"
                transform={`rotate(${deg} 120 80)`}
                stroke="currentColor"
                strokeWidth="2"
              />
            ))}
            <path
              d="M196 22v18m-9-9h18M39 118v14m-7-7h14"
              stroke="currentColor"
              strokeWidth="2"
            />
          </>
        )}
        {mood === "snowboarding" && (
          <>
            <circle cx="187" cy="32" r="20" fill="currentColor" opacity=".4" />
            <path
              d="m-10 160 90-120 60 78 32-40 78 82H-10Z"
              fill="currentColor"
              opacity=".15"
            />
            <path
              d="m-10 160 90-120 60 78 32-40 78 82M55 74l25 10 16-23M80 40 40 160m132-82-12 35 13-9"
              stroke="currentColor"
              strokeWidth="2"
            />
          </>
        )}
      </svg>
    </div>
  );
}

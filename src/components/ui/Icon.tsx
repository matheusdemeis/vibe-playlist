import type { SVGProps } from "react";

const paths = {
  arrow: "M5 12h14m-6-6 6 6-6 6",
  external:
    "M14 4h6v6m0-6L10 14M10 4H5a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-5",
  check: "m5 12 4 4L19 6",
  close: "m6 6 12 12M6 18 18 6",
  music:
    "M9 17V5l11-2v12M9 8l11-2M9 17c0 2-2 3-4 3s-3-1-3-2 2-3 4-3 3 1 3 2Zm11-2c0 2-2 3-4 3s-3-1-3-2 2-3 4-3 3 1 3 2Z",
  refresh:
    "M20 7v5h-5M4 17v-5h5M5.5 7a8 8 0 0 1 13-2L20 7M4 17l1.5 2a8 8 0 0 0 13-2",
  shuffle:
    "m17 3 4 4-4 4M3 17h3c4 0 6-10 10-10h5M3 7h3c1 0 2 .5 3 2m6 6c.5 1 1 2 3 2h3m-4-4 4 4-4 4",
  lock: "M7 10V7a5 5 0 0 1 10 0v3M6 10h12a1 1 0 0 1 1 1v9H5v-9a1 1 0 0 1 1-1Zm6 4v3",
  sliders: "M4 7h4m4 0h8M4 17h8m4 0h4M8 4v6m8 4v6",
  spark: "m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3Z",
  clock: "M12 7v5l3 2M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0Z",
} as const;

export function Icon({
  name,
  ...props
}: SVGProps<SVGSVGElement> & { name: keyof typeof paths }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <path d={paths[name]} />
    </svg>
  );
}

export function SpotifyIcon() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      aria-hidden="true"
      fill="currentColor"
    >
      <circle cx="12" cy="12" r="11" />
      <g
        fill="none"
        stroke="var(--background)"
        strokeWidth="1.6"
        strokeLinecap="round"
      >
        <path d="M6 9c4-1.5 8-1 12 1M7 12c3-1 7-.5 10 1M8 15c3-.7 5-.3 8 1" />
      </g>
    </svg>
  );
}

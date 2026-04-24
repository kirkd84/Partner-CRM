/**
 * Partner Portal brand glyph — a proper two-hand handshake, split down
 * the middle into grey (left) and red (right). Built as a single inline
 * SVG path (the widely-recognised handshake silhouette from Lucide) with
 * a hard-stop linear gradient so the left arm renders grey and the right
 * arm renders red, with the clasped hands in the centre showing both
 * colours where the two halves interlock.
 *
 * Previous iteration used two chunky mitts butted against a dark clasp,
 * which read as boxing gloves rather than a handshake. This version uses
 * the canonical "two forearms meeting at clasped hands" shape so the
 * logo registers as a handshake immediately, even at favicon sizes.
 */
export function BrandLogo({ className = 'h-9 w-9' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      role="img"
      aria-label="Partner Portal"
      fill="none"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <defs>
        {/* Hard colour split at the vertical midline so anything drawn
            left of x=12 renders grey and anything right of x=12 renders
            red. `gradientUnits=userSpaceOnUse` anchors the gradient to
            SVG coordinates (not the bounding box of each path), which is
            what makes the clean down-the-middle split work. */}
        <linearGradient
          id="pp-handshake"
          x1="0"
          x2="24"
          y1="0"
          y2="0"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0.5" stopColor="#9ca3af" />
          <stop offset="0.5" stopColor="#dc2626" />
        </linearGradient>
      </defs>
      <g stroke="url(#pp-handshake)">
        {/* Lucide's Handshake icon path, split across five sub-paths so
            stroke-linecap rounds the ends of each segment cleanly. */}
        <path d="m11 17 2 2a1 1 0 1 0 3-3" />
        <path d="m14 14 2.5 2.5a1 1 0 1 0 3-3l-3.88-3.88a3 3 0 0 0-4.24 0l-.88.88a1 1 0 1 1-3-3l2.81-2.81a5.79 5.79 0 0 1 7.06-.87l.47.28a2 2 0 0 0 1.42.25L21 4" />
        <path d="m21 3 1 11h-2" />
        <path d="M3 3 2 14l6.5 6.5a1 1 0 1 0 3-3" />
        <path d="M3 4h8" />
      </g>
    </svg>
  );
}

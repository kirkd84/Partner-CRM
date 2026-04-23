/**
 * Partner Portal brand glyph — two interlocked hands, one grey one red,
 * Storm-style. Built as an inline 2-tone SVG because Lucide's Handshake
 * is a single-stroke outline icon (same color across the whole path).
 *
 * The hands are stylized cuff + palm + fingers silhouettes meeting at a
 * clasp. Not a literal photorealistic handshake; a crisp 2-color brand
 * mark that reads at 20–40px.
 */
export function BrandLogo({ className = 'h-9 w-9' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 24"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      role="img"
      aria-label="Partner Portal"
    >
      {/* Left hand + sleeve — grey */}
      <g fill="#9ca3af">
        {/* sleeve */}
        <rect x="0" y="9" width="5" height="8" rx="1.5" />
        {/* hand: palm + curved fingers pointing toward the clasp */}
        <path d="M5 9 Q 9 7 12 9 L 15 11 L 15 13 L 12 15 Q 9 17 5 15 Z" />
        {/* thumb over the clasp */}
        <path d="M12 9 Q 13.5 8 14.5 9.5 L 15 11 L 13.5 11 Z" />
      </g>
      {/* Right hand + sleeve — red */}
      <g fill="#dc2626">
        <rect x="27" y="9" width="5" height="8" rx="1.5" />
        <path d="M27 9 Q 23 7 20 9 L 17 11 L 17 13 L 20 15 Q 23 17 27 15 Z" />
        <path d="M20 15 Q 18.5 16 17.5 14.5 L 17 13 L 18.5 13 Z" />
      </g>
      {/* Clasp knuckle — dark slate so the two halves read as interlocked */}
      <rect x="14.5" y="10.5" width="3" height="3" rx="0.6" fill="#334155" />
    </svg>
  );
}

/**
 * /icon.png — Next 15 file-based metadata. The component below renders
 * to a PNG at build time and Next emits the link tag automatically.
 *
 * Design matches the in-app BrandLogo: a two-tone handshake glyph
 * (Lucide handshake path) with a vertical grey/red gradient split.
 * Used by the PWA install prompt + manifest references at large sizes.
 *
 * Earlier versions used a stylized radar sweep; we've migrated to the
 * handshake to align favicon + brand chip + apple-icon under a single
 * mark. See /apple-icon.tsx and /icon0.tsx for the matching variants.
 */

import { ImageResponse } from 'next/og';

export const size = { width: 512, height: 512 };
export const contentType = 'image/png';

export default function Icon() {
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'transparent',
      }}
    >
      <svg
        width="380"
        height="380"
        viewBox="0 0 24 24"
        fill="none"
        stroke="#dc2626"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <linearGradient
            id="pp-handshake-512"
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
        <g stroke="url(#pp-handshake-512)">
          <path d="m11 17 2 2a1 1 0 1 0 3-3" />
          <path d="m14 14 2.5 2.5a1 1 0 1 0 3-3l-3.88-3.88a3 3 0 0 0-4.24 0l-.88.88a1 1 0 1 1-3-3l2.81-2.81a5.79 5.79 0 0 1 7.06-.87l.47.28a2 2 0 0 0 1.42.25L21 4" />
          <path d="m21 3 1 11h-2" />
          <path d="M3 3 2 14l6.5 6.5a1 1 0 1 0 3-3" />
          <path d="M3 4h8" />
        </g>
      </svg>
    </div>,
    {
      ...size,
    },
  );
}

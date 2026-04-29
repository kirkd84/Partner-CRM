/**
 * 32×32 favicon — Next 15 picks this over /icon.tsx for the tab bar
 * because browsers prefer the closest-matching size. The bigger
 * 512×512 icon.tsx is for PWA install + manifest references.
 *
 * Design matches the in-app BrandLogo: the Lucide handshake silhouette
 * with a hard-stop grey/red gradient down the vertical midline.
 *
 * Background is transparent so the glyph rides whatever color the
 * browser tab uses (dark mode chrome would otherwise show a glaring
 * white tile). Both brand colors (#9ca3af grey + #dc2626 red) carry
 * enough contrast to register on either light or dark backgrounds.
 */

import { ImageResponse } from 'next/og';

export const size = { width: 32, height: 32 };
export const contentType = 'image/png';

export default function FaviconSmall() {
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
        width="30"
        height="30"
        viewBox="0 0 24 24"
        fill="none"
        stroke="#dc2626"
        strokeWidth="2.25"
        strokeLinecap="round"
        strokeLinejoin="round"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <linearGradient
            id="pp-handshake-32"
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
        <g stroke="url(#pp-handshake-32)">
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

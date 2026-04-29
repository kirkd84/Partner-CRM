/**
 * /apple-icon.png — same icon, sized for iOS home-screen install
 * (Apple uses 180×180 specifically). Generated at build time by Next.
 *
 * Kept as its own file (vs. linking to the PWA icon) because iOS
 * applies its own rounded-corner mask and sometimes punches holes if
 * the icon already has transparency — so we stamp a fully-opaque
 * background here.
 */

import { ImageResponse } from 'next/og';

export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

export default function AppleIcon() {
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#ffffff',
      }}
    >
      <svg
        width="132"
        height="132"
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
            id="pp-handshake-apple"
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
        <g stroke="url(#pp-handshake-apple)">
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

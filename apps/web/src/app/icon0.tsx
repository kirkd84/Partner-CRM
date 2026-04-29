/**
 * 32×32 favicon — Next 15 picks this over /icon.tsx for the tab bar
 * because browsers prefer the closest-matching size. The bigger
 * 512×512 icon.tsx is for PWA install + manifest references.
 *
 * Design: simplified for 16/32-px legibility. Drop the concentric
 * rings (they smear into a blur) and keep just the center dot +
 * a single bold sweep wedge.
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
        background: '#1e40af',
        color: 'white',
      }}
    >
      <svg
        width="26"
        height="26"
        viewBox="0 0 32 32"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Bold sweep wedge — readable at 16x16 */}
        <path d="M16 16 L16 4 A12 12 0 0 1 27 21 Z" fill="white" fillOpacity="0.9" />
        {/* Center pin */}
        <circle cx="16" cy="16" r="3" fill="white" />
      </svg>
    </div>,
    {
      ...size,
    },
  );
}

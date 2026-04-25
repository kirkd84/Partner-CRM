/**
 * /icon.png — Next 15 file-based metadata. The component below renders
 * to a PNG at build time and Next emits the link tag automatically.
 *
 * Design: filled blue square, rounded corners, with a stylized radar
 * sweep — concentric arcs in white. Read clean at 32px favicon size
 * AND at the 192/512 PWA sizes because the geometry is simple.
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
        background: 'linear-gradient(135deg, #1e3a8a 0%, #1e40af 50%, #2563eb 100%)',
        color: 'white',
        // The gradient + the radar arcs together give the icon
        // enough visual energy that we don't need to also stamp
        // text — text would be illegible at 32px anyway.
      }}
    >
      <svg
        width="360"
        height="360"
        viewBox="0 0 360 360"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Concentric radar rings */}
        <circle cx="180" cy="180" r="140" stroke="white" strokeOpacity="0.25" strokeWidth="6" />
        <circle cx="180" cy="180" r="100" stroke="white" strokeOpacity="0.4" strokeWidth="6" />
        <circle cx="180" cy="180" r="60" stroke="white" strokeOpacity="0.55" strokeWidth="6" />
        {/* Sweep wedge */}
        <path d="M180 180 L180 40 A140 140 0 0 1 308 230 Z" fill="white" fillOpacity="0.18" />
        {/* Center pin */}
        <circle cx="180" cy="180" r="18" fill="white" />
      </svg>
    </div>,
    {
      ...size,
    },
  );
}

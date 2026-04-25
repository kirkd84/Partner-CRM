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
        background: 'linear-gradient(135deg, #1e3a8a 0%, #1e40af 50%, #2563eb 100%)',
        color: 'white',
      }}
    >
      <svg
        width="128"
        height="128"
        viewBox="0 0 360 360"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <circle cx="180" cy="180" r="140" stroke="white" strokeOpacity="0.25" strokeWidth="6" />
        <circle cx="180" cy="180" r="100" stroke="white" strokeOpacity="0.4" strokeWidth="6" />
        <circle cx="180" cy="180" r="60" stroke="white" strokeOpacity="0.55" strokeWidth="6" />
        <path d="M180 180 L180 40 A140 140 0 0 1 308 230 Z" fill="white" fillOpacity="0.18" />
        <circle cx="180" cy="180" r="18" fill="white" />
      </svg>
    </div>,
    {
      ...size,
    },
  );
}

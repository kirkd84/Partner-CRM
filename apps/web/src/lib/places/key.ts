/**
 * Resolve the Google Places API key from whichever env var Kirk has
 * set. We accept three forms so we can reuse the key he already
 * configured for the Phase-4 map, or a dedicated Places key if he
 * ever wants to split quotas.
 */
export function placesApiKey(): string | null {
  return (
    process.env.GOOGLE_PLACES_API_KEY ||
    process.env.NEXT_PUBLIC_GOOGLE_PLACES_API_KEY ||
    process.env.GOOGLE_MAPS_API_KEY ||
    null
  );
}

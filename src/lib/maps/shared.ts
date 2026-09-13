/**
 * The parts of the maps module that are safe in a browser bundle.
 *
 * `index.ts` validates the server environment at module scope — importing
 * anything from it in a client component drags `DATABASE_URL` and `AUTH_SECRET`
 * into the browser, where they do not exist, and the module throws before the
 * component ever renders. So the pure helpers live here, with no imports that
 * reach the server, and `index.ts` re-exports them for server callers.
 */

export interface LatLng {
  latitude: number;
  longitude: number;
}

export interface GeocodeResult extends LatLng {
  formattedAddress: string;
  /** Provider-specific place identifier, when available. */
  placeId?: string;
}

/**
 * Round coordinates down to roughly street-block accuracy, for showing
 * someone who should see the area but not the doorstep — the ops map before a
 * job is accepted, for instance.
 */
export function coarsen(point: LatLng, precision = 2): LatLng {
  const factor = 10 ** precision;
  return {
    latitude: Math.round(point.latitude * factor) / factor,
    longitude: Math.round(point.longitude * factor) / factor,
  };
}

/** Deep link that works with no API key at all — opens the user's own map app. */
export function directionsUrl(destination: LatLng, label?: string): string {
  const query = label
    ? `${destination.latitude},${destination.longitude}(${encodeURIComponent(label)})`
    : `${destination.latitude},${destination.longitude}`;
  return `https://www.google.com/maps/dir/?api=1&destination=${query}`;
}

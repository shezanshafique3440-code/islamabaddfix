import { env, integrations } from '../env';
import { AppError } from '../errors';
import { distanceKm } from '../utils';

/**
 * Maps abstraction.
 *
 * The booking flow must work with maps entirely unconfigured — that is the
 * common case on day one, and address entry in Islamabad works fine with a
 * sector plus a written address. So:
 *
 *  - Distance always works: it falls back to zone centroids, and then to a
 *    neutral mid-range estimate, so provider matching never breaks.
 *  - Geocoding and reverse geocoding report NOT_CONFIGURED rather than
 *    inventing coordinates.
 *  - The client reads `mapsStatus()` and renders a manual address form instead
 *    of a dead map canvas.
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

export const mapsStatus = () => ({
  configured: integrations.maps.configured,
  provider: integrations.maps.provider,
});

/**
 * Straight-line distance between a job and a provider.
 *
 * `fallbackKm` is used when neither party has coordinates. It is deliberately a
 * mid-range value rather than 0: treating an unknown distance as "next door"
 * would let the matcher rank providers it knows nothing about above nearby ones.
 */
export function estimateDistanceKm(
  from: LatLng | null,
  to: LatLng | null,
  fallbackKm = 8,
): { km: number; isEstimate: boolean } {
  if (from && to) return { km: distanceKm(from, to), isEstimate: false };
  return { km: fallbackKm, isEstimate: true };
}

export async function geocodeAddress(query: string): Promise<GeocodeResult> {
  if (!integrations.maps.configured) {
    throw new AppError(
      'INTEGRATION_NOT_CONFIGURED',
      'Maps abhi configured nahi hai. Address manually likhein ya sector select karein.',
    );
  }

  if (env.MAPS_PROVIDER === 'google') {
    const url = new URL('https://maps.googleapis.com/maps/api/geocode/json');
    url.searchParams.set('address', query);
    // Bias results to Pakistan so "G-10" resolves locally rather than abroad.
    url.searchParams.set('components', 'country:PK');
    url.searchParams.set('key', env.MAPS_API_KEY!);
    const response = await fetch(url, { next: { revalidate: 86_400 } });
    if (!response.ok) throw new AppError('INTEGRATION_FAILED', 'Geocoding request fail ho gayi.');
    const json = (await response.json()) as {
      status: string;
      results?: Array<{
        formatted_address: string;
        place_id: string;
        geometry: { location: { lat: number; lng: number } };
      }>;
    };
    const first = json.results?.[0];
    if (json.status !== 'OK' || !first) {
      throw new AppError('NOT_FOUND', 'Yeh address maps par nahi mila.');
    }
    return {
      latitude: first.geometry.location.lat,
      longitude: first.geometry.location.lng,
      formattedAddress: first.formatted_address,
      placeId: first.place_id,
    };
  }

  if (env.MAPS_PROVIDER === 'mapbox') {
    const url = new URL(
      `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json`,
    );
    url.searchParams.set('country', 'pk');
    url.searchParams.set('limit', '1');
    url.searchParams.set('access_token', env.MAPS_API_KEY!);
    const response = await fetch(url, { next: { revalidate: 86_400 } });
    if (!response.ok) throw new AppError('INTEGRATION_FAILED', 'Geocoding request fail ho gayi.');
    const json = (await response.json()) as {
      features?: Array<{ place_name: string; id: string; center: [number, number] }>;
    };
    const first = json.features?.[0];
    if (!first) throw new AppError('NOT_FOUND', 'Yeh address maps par nahi mila.');
    return {
      // Mapbox returns [longitude, latitude].
      longitude: first.center[0],
      latitude: first.center[1],
      formattedAddress: first.place_name,
      placeId: first.id,
    };
  }

  throw new AppError('INTEGRATION_NOT_CONFIGURED', 'Maps provider unknown hai.');
}

export async function reverseGeocode(point: LatLng): Promise<GeocodeResult> {
  if (!integrations.maps.configured) {
    throw new AppError(
      'INTEGRATION_NOT_CONFIGURED',
      'Maps abhi configured nahi hai. Address manually likhein.',
    );
  }

  if (env.MAPS_PROVIDER === 'google') {
    const url = new URL('https://maps.googleapis.com/maps/api/geocode/json');
    url.searchParams.set('latlng', `${point.latitude},${point.longitude}`);
    url.searchParams.set('key', env.MAPS_API_KEY!);
    const response = await fetch(url);
    if (!response.ok) throw new AppError('INTEGRATION_FAILED', 'Reverse geocoding fail ho gayi.');
    const json = (await response.json()) as {
      results?: Array<{ formatted_address: string; place_id: string }>;
    };
    const first = json.results?.[0];
    if (!first) throw new AppError('NOT_FOUND', 'Is location ka address nahi mila.');
    return { ...point, formattedAddress: first.formatted_address, placeId: first.place_id };
  }

  if (env.MAPS_PROVIDER === 'mapbox') {
    const url = new URL(
      `https://api.mapbox.com/geocoding/v5/mapbox.places/${point.longitude},${point.latitude}.json`,
    );
    url.searchParams.set('access_token', env.MAPS_API_KEY!);
    const response = await fetch(url);
    if (!response.ok) throw new AppError('INTEGRATION_FAILED', 'Reverse geocoding fail ho gayi.');
    const json = (await response.json()) as { features?: Array<{ place_name: string; id: string }> };
    const first = json.features?.[0];
    if (!first) throw new AppError('NOT_FOUND', 'Is location ka address nahi mila.');
    return { ...point, formattedAddress: first.place_name, placeId: first.id };
  }

  throw new AppError('INTEGRATION_NOT_CONFIGURED', 'Maps provider unknown hai.');
}

/**
 * Coarsen a point to roughly a 1 km grid. Used wherever a location is shown to
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

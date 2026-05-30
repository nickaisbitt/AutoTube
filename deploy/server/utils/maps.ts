// ============================================================================
// Map utilities — OpenStreetMap static maps & Nominatim geocoding
// ============================================================================

const NOMINATIM_USER_AGENT = "AutoTube/1.0 (dev)";

// ---------------------------------------------------------------------------
// Geocoding — convert place name to coordinates via Nominatim (free OSM API)
// ---------------------------------------------------------------------------

export interface GeocodeResult {
  lat: number;
  lon: number;
  displayName: string;
  boundingBox?: [number, number, number, number]; // minLat, maxLat, minLon, maxLon
}

/**
 * Geocode a place name to coordinates using OpenStreetMap's Nominatim API.
 * Free, no API key required. Max 1 request/second (per usage policy).
 */
export async function geocodePlace(query: string): Promise<GeocodeResult | null> {
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1&addressdetails=0`;

  const res = await fetch(url, {
    headers: { "User-Agent": NOMINATIM_USER_AGENT },
  });

  if (!res.ok) {
    console.warn(`[Nominatim] HTTP ${res.status} for "${query}"`);
    return null;
  }

  const data = await res.json();
  if (!Array.isArray(data) || data.length === 0) return null;

  const result = data[0];
  return {
    lat: parseFloat(result.lat),
    lon: parseFloat(result.lon),
    displayName: result.display_name || query,
    boundingBox: result.boundingbox
      ? [
          parseFloat(result.boundingbox[0]),
          parseFloat(result.boundingbox[1]),
          parseFloat(result.boundingbox[2]),
          parseFloat(result.boundingbox[3]),
        ]
      : undefined,
  };
}

// ---------------------------------------------------------------------------
// Static map tile URL generation
// Uses OpenStreetMap tile servers (free & open source)
// ---------------------------------------------------------------------------

export interface StaticMapOptions {
  center: { lat: number; lon: number };
  zoom?: number;
  width?: number;
  height?: number;
  /** Map style: 'mapnik' (default streets), 'topo' (topographic) */
  style?: 'mapnik' | 'topo' | 'satellite';
}

/**
 * Generate a static map image URL for a given location using OpenStreetMap.
 * Uses the staticmap.openstreetmap.de service (free, no API key).
 */
export function buildStaticMapUrl(options: StaticMapOptions): string | null {
  const { center, zoom = 10, width = 1920, height = 1080, style = 'mapnik' } = options;

  const baseUrl = 'https://staticmap.openstreetmap.de/staticmap.php';
  const params = new URLSearchParams({
    center: `${center.lat},${center.lon}`,
    zoom: String(zoom),
    size: `${width}x${height}`,
    maptype: style === 'satellite' ? 'mapnik' : style, // fallback: no satellite tiles via OSM
  });

  return `${baseUrl}?${params.toString()}`;
}

/**
 * Generate a static map tile URL. Returns multiple zoom levels for variety.
 */
export function buildMapCandidates(
  placeName: string,
  geo: GeocodeResult,
): { url: string; alt: string; width: number; height: number }[] {
  const zooms = [8, 10, 12, 14];
  return zooms
    .map((zoom) => {
      const url = buildStaticMapUrl({
        center: { lat: geo.lat, lon: geo.lon },
        zoom,
        width: 1920,
        height: 1080,
      });
      if (!url) return null;
      return {
        url,
        alt: `Map of ${geo.displayName || placeName}`,
        width: 1920,
        height: 1080,
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);
}

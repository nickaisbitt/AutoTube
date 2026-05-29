// ============================================================================
// Copyright Verification & License Tracking
// ============================================================================

import { logger } from './logger';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface LicenseInfo {
  /** Source identifier (e.g., 'flickr', 'pexels', 'wikimedia') */
  source: string;
  /** License type (e.g., 'CC BY 2.0', 'Pexels License', 'Public Domain') */
  licenseType: string;
  /** Whether attribution is required */
  attributionRequired: boolean;
  /** Attribution text if required */
  attributionText?: string;
  /** Source URL for the asset */
  sourceUrl?: string;
  /** Whether the license allows commercial use */
  commercialUse: boolean;
  /** Whether modifications are allowed */
  modificationsAllowed: boolean;
}

// ---------------------------------------------------------------------------
// License Registry
// ---------------------------------------------------------------------------

const KNOWN_LICENSES: Record<string, LicenseInfo> = {
  flickr_cc_by: {
    source: 'flickr',
    licenseType: 'CC BY 2.0',
    attributionRequired: true,
    commercialUse: true,
    modificationsAllowed: true,
  },
  flickr_cc_by_sa: {
    source: 'flickr',
    licenseType: 'CC BY-SA 2.0',
    attributionRequired: true,
    commercialUse: true,
    modificationsAllowed: true,
  },
  flickr_cc_by_nc: {
    source: 'flickr',
    licenseType: 'CC BY-NC 2.0',
    attributionRequired: true,
    commercialUse: false,
    modificationsAllowed: true,
  },
  flickr_cc_by_nc_sa: {
    source: 'flickr',
    licenseType: 'CC BY-NC-SA 2.0',
    attributionRequired: true,
    commercialUse: false,
    modificationsAllowed: true,
  },
  flickr_cc_by_nd: {
    source: 'flickr',
    licenseType: 'CC BY-ND 2.0',
    attributionRequired: true,
    commercialUse: true,
    modificationsAllowed: false,
  },
  flickr_cc_by_nc_nd: {
    source: 'flickr',
    licenseType: 'CC BY-NC-ND 2.0',
    attributionRequired: true,
    commercialUse: false,
    modificationsAllowed: false,
  },
  flickr_cc0: {
    source: 'flickr',
    licenseType: 'CC0 1.0',
    attributionRequired: false,
    commercialUse: true,
    modificationsAllowed: true,
  },
  flickr_pd: {
    source: 'flickr',
    licenseType: 'Public Domain Mark',
    attributionRequired: false,
    commercialUse: true,
    modificationsAllowed: true,
  },
  pexels: {
    source: 'pexels',
    licenseType: 'Pexels License',
    attributionRequired: false,
    commercialUse: true,
    modificationsAllowed: true,
  },
  pixabay: {
    source: 'pixabay',
    licenseType: 'Pixabay License',
    attributionRequired: false,
    commercialUse: true,
    modificationsAllowed: true,
  },
  wikimedia_cc: {
    source: 'wikimedia',
    licenseType: 'Creative Commons',
    attributionRequired: true,
    commercialUse: true,
    modificationsAllowed: true,
  },
  archive_cc: {
    source: 'archive.org',
    licenseType: 'Creative Commons',
    attributionRequired: true,
    commercialUse: true,
    modificationsAllowed: true,
  },
  nasa_pd: {
    source: 'nasa',
    licenseType: 'Public Domain',
    attributionRequired: false,
    commercialUse: true,
    modificationsAllowed: true,
  },
};

// ---------------------------------------------------------------------------
// Source Detection
// ---------------------------------------------------------------------------

function detectSource(sourceField: string): string {
  const lower = sourceField.toLowerCase();
  if (lower.includes('flickr')) return 'flickr';
  if (lower.includes('pexels')) return 'pexels';
  if (lower.includes('pixabay')) return 'pixabay';
  if (lower.includes('wikimedia') || lower.includes('wikipedia')) return 'wikimedia';
  if (lower.includes('archive.org') || lower.includes('archive')) return 'archive.org';
  if (lower.includes('nasa')) return 'nasa';
  if (lower.includes('unsplash')) return 'unsplash';
  if (lower.includes('picsum')) return 'picsum';
  if (lower.includes('duckduckgo') || lower.includes('ddg')) return 'search_engine';
  if (lower.includes('bing')) return 'search_engine';
  if (lower.includes('google')) return 'search_engine';
  return 'unknown';
}

function detectFlickrLicense(sourceField: string): string {
  const lower = sourceField.toLowerCase();
  if (lower.includes('cc by-nc-sa')) return 'flickr_cc_by_nc_sa';
  if (lower.includes('cc by-nc-nd')) return 'flickr_cc_by_nc_nd';
  if (lower.includes('cc by-nc')) return 'flickr_cc_by_nc';
  if (lower.includes('cc by-sa')) return 'flickr_cc_by_sa';
  if (lower.includes('cc by-nd')) return 'flickr_cc_by_nd';
  if (lower.includes('cc by')) return 'flickr_cc_by';
  if (lower.includes('cc0')) return 'flickr_cc0';
  if (lower.includes('public domain')) return 'flickr_pd';
  return 'flickr_cc_by'; // Default to most permissive CC license
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Determines the license info for a media asset based on its source metadata.
 */
export function determineLicense(source: string, sourceUrl?: string): LicenseInfo {
  const detectedSource = detectSource(source);

  if (detectedSource === 'flickr') {
    const flickrLicense = detectFlickrLicense(source);
    const info = KNOWN_LICENSES[flickrLicense];
    if (info) {
      const attributionText = info.attributionRequired
        ? `Photo via Flickr (${info.licenseType})`
        : undefined;
      return { ...info, attributionText, sourceUrl };
    }
  }

  const baseKey = detectedSource === 'wikimedia' ? 'wikimedia_cc'
    : detectedSource === 'archive.org' ? 'archive_cc'
    : detectedSource === 'nasa' ? 'nasa_pd'
    : detectedSource === 'pexels' ? 'pexels'
    : detectedSource === 'pixabay' ? 'pixabay'
    : null;

  if (baseKey && KNOWN_LICENSES[baseKey]) {
    return { ...KNOWN_LICENSES[baseKey], sourceUrl };
  }

  // Unknown source — assume restrictive
  logger.warn('LicenseTracker', `Unknown source "${source}" — defaulting to restrictive license`);
  return {
    source: detectedSource,
    licenseType: 'Unknown',
    attributionRequired: true,
    commercialUse: false,
    modificationsAllowed: false,
    sourceUrl,
  };
}

/**
 * Verifies that an asset's license is compatible with YouTube monetization.
 * Returns true if the asset can be used commercially.
 */
export function isLicenseCompatible(license: LicenseInfo): boolean {
  return license.commercialUse && license.modificationsAllowed;
}

/**
 * Generates attribution text for assets that require it.
 */
export function generateAttribution(license: LicenseInfo, assetAlt?: string): string {
  if (!license.attributionRequired) return '';
  const parts: string[] = [];
  if (license.attributionText) parts.push(license.attributionText);
  if (assetAlt) parts.push(`"${assetAlt}"`);
  if (license.sourceUrl) parts.push(license.sourceUrl);
  return parts.join(' | ');
}

/**
 * Stores license info for an asset. Returns the license metadata to store.
 */
export function trackLicense(
  assetUrl: string,
  source: string,
  sourceUrl?: string,
): LicenseInfo & { assetUrl: string; trackedAt: number } {
  const license = determineLicense(source, sourceUrl);
  logger.info('LicenseTracker', `Tracked license for ${source}: ${license.licenseType} (commercial: ${license.commercialUse})`);
  return { ...license, assetUrl, trackedAt: Date.now() };
}

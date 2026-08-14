/**
 * Single source of truth for the real brand imagery supplied for PR #23
 * (`public/brand/`), so components never hardcode an asset path. Every
 * entry is the SUPPLIED artwork, unaltered except where noted -- never a
 * recreated/redrawn substitute.
 */

/**
 * Standalone מי-מה-מו symbol, background keyed to transparent (from the
 * supplied opaque icon) for inline placement next to text on any surface
 * color -- compact identity (Sidebar, mobile header) and the source for
 * the site's favicon/app icon (`src/app/icon.png`).
 */
export const BRAND_SYMBOL = { src: "/brand/symbol.png", width: 512, height: 512 } as const;

/**
 * The wordmark lockup (מי-מה-מו text with the symbol's ears/horns
 * integrated into the letterforms), cropped from the supplied full logo
 * to exclude its baked-in tagline text and the duplicate icon badge --
 * the tagline already exists as its own live text (`LOGIN_HERO_HEADLINE`)
 * elsewhere on the login page, so including it a second time inside the
 * image would duplicate the same sentence twice on one screen. The
 * selected pixels are the original artwork, unaltered.
 */
export const BRAND_LOGO_WORDMARK = { src: "/brand/logo-wordmark.png", width: 996, height: 329 } as const;

/**
 * The complete supplied lockup (wordmark + tagline + icon badge),
 * unmodified. Not currently wired into any UI -- kept as the pristine
 * source asset for any future full-lockup placement.
 */
export const BRAND_LOGO_FULL = { src: "/brand/logo-full.webp", width: 1536, height: 1024 } as const;

/** תקש"ל organizational logo, unmodified/uncropped. */
export const ORG_LOGO_TAKSHAL = {
  src: "/brand/org-logo-takshal.webp",
  width: 1024,
  height: 1536,
  alt: 'תקש"ל',
} as const;

/** תקשורת אסטרטגית organizational logo, unmodified/uncropped. */
export const ORG_LOGO_STRATEGIC_COMMUNICATION = {
  src: "/brand/org-logo-strategic-communication.webp",
  width: 1024,
  height: 1024,
  alt: "תקשורת אסטרטגית",
} as const;

import Image from "next/image";
import { BRAND_LOGO_WORDMARK } from "@/lib/config/brandAssets";

/**
 * The full מי-מה-מו identity mark for the login hero (Design Pass PR #23)
 * -- the wordmark lockup with the symbol's ears/horns integrated into the
 * letterforms, cropped from the supplied full logo to exclude its
 * baked-in tagline (the tagline is `LOGIN_HERO_HEADLINE`, rendered as its
 * own live text below this, so including it here too would show the same
 * sentence twice).
 *
 * The artwork's dark-navy letterforms are drawn for a light backing --
 * placed directly on this page's midnight hero canvas they'd have almost
 * no contrast. Rather than editing the supplied artwork to "fix" that,
 * this wraps it in its own small light plate, matching the glass-surface
 * language already established by the auth card elsewhere on this page.
 * The hero canvas itself is the same fixed dark background regardless of
 * the user's light/dark preference, so this plate needs no theme
 * variants either.
 */
export function LoginBrandLogo() {
  return (
    <div className="inline-flex rounded-[20px] bg-white/95 px-6 py-4 shadow-[0_16px_36px_-12px_rgba(0,0,0,0.5)] ring-1 ring-black/5 backdrop-blur-sm sm:rounded-[24px] sm:px-7 sm:py-5 lg:rounded-[28px] lg:px-8 lg:py-6">
      <Image
        src={BRAND_LOGO_WORDMARK.src}
        alt="מי-מה-מו"
        width={BRAND_LOGO_WORDMARK.width}
        height={BRAND_LOGO_WORDMARK.height}
        priority
        className="h-14 w-auto sm:h-[68px] lg:h-20"
      />
    </div>
  );
}

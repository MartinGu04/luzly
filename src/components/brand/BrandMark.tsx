import Image from "next/image";
import { APP_NAME } from "@/lib/config/productName";
import { BRAND_SYMBOL } from "@/lib/config/brandAssets";

interface BrandMarkProps {
  size?: "sm" | "md";
  className?: string;
}

const SIZE_CLASSES = {
  sm: { icon: "h-8 w-8", text: "text-base", gap: "gap-2.5" },
  md: { icon: "h-10 w-10", text: "text-2xl", gap: "gap-3" },
} as const;

/**
 * Compact product identity -- the מי-מה-מו symbol next to the wordmark
 * text, reused everywhere the brand needs a small, self-contained mark
 * (desktop Sidebar, mobile header) rather than the full lockup logo (that
 * lives on /login only, where there's room for the complete identity).
 *
 * The icon is purely decorative here (it repeats what the adjacent text
 * already says), so it's `alt=""`/`aria-hidden` to avoid double
 * announcing the same name to screen readers.
 */
export function BrandMark({ size = "md", className = "" }: BrandMarkProps) {
  const sizes = SIZE_CLASSES[size];
  return (
    <span className={`flex items-center ${sizes.gap} ${className}`}>
      <Image
        src={BRAND_SYMBOL.src}
        alt=""
        aria-hidden="true"
        width={BRAND_SYMBOL.width}
        height={BRAND_SYMBOL.height}
        className={`${sizes.icon} shrink-0`}
      />
      <span className={`font-bold tracking-tight ${sizes.text}`}>{APP_NAME}</span>
    </span>
  );
}

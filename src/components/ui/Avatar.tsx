"use client";

import { useState } from "react";
import { initialsOf } from "@/lib/presentation/avatar";

interface AvatarProps {
  name: string;
  size?: "sm" | "md";
  className?: string;
  /**
   * The Google account's profile photo (presentation-only -- see
   * `lib/auth/currentUser.ts`). `null`/omitted falls back to initials, and
   * so does a failed image load (tracked here, not assumed) -- never a
   * broken-image icon.
   */
  avatarUrl?: string | null;
}

/**
 * Circular avatar: shows the account's photo when one is available and
 * loads successfully, otherwise falls back to initials generated from the
 * name -- no image upload/storage involved either way. A plain `<img>`
 * rather than `next/image` on purpose: the URL is external OAuth-provided
 * data, and `next/image` hard-errors for any host outside a configured
 * allowlist instead of degrading gracefully, which is exactly the wrong
 * failure mode here.
 */
export function Avatar({ name, size = "md", className = "", avatarUrl = null }: AvatarProps) {
  const [imageFailed, setImageFailed] = useState(false);
  // A changed URL deserves a fresh attempt, not a stale "already failed"
  // verdict from a previous photo -- adjusted during render (React's
  // documented pattern for this), not via a setState-in-effect, which
  // would cost an extra commit/paint for no benefit here.
  const [lastAvatarUrl, setLastAvatarUrl] = useState(avatarUrl);
  if (avatarUrl !== lastAvatarUrl) {
    setLastAvatarUrl(avatarUrl);
    setImageFailed(false);
  }

  const initials = initialsOf(name);
  const sizeClasses = size === "sm" ? "h-8 w-8 text-[11px]" : "h-10 w-10 text-sm";
  const showPhoto = avatarUrl !== null && !imageFailed;

  return (
    <div
      aria-hidden="true"
      className={`flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-primary to-primary-strong font-semibold text-primary-foreground ring-1 ring-white/10 ${sizeClasses} ${className}`}
    >
      {showPhoto ? (
        // eslint-disable-next-line @next/next/no-img-element -- external OAuth-provided URL; must degrade gracefully via onError, which next/image cannot do for unconfigured hosts.
        <img
          src={avatarUrl}
          alt=""
          data-testid="avatar-photo"
          referrerPolicy="no-referrer"
          className="h-full w-full object-cover"
          onError={() => setImageFailed(true)}
        />
      ) : (
        initials
      )}
    </div>
  );
}

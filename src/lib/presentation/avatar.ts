/**
 * One or two-letter avatar initials from a (possibly multi-word) name --
 * first letter of the first word, plus first letter of the last word when
 * there is more than one. Never throws on a blank name.
 */
export function initialsOf(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "";
  if (parts.length === 1) return parts[0].slice(0, 2);
  return `${parts[0].slice(0, 1)}${parts[parts.length - 1].slice(0, 1)}`;
}

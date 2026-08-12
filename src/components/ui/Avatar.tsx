import { initialsOf } from "@/lib/presentation/avatar";

interface AvatarProps {
  name: string;
  size?: "sm" | "md";
  className?: string;
}

/** Circular initials avatar generated from a name -- no image upload/storage involved. */
export function Avatar({ name, size = "md", className = "" }: AvatarProps) {
  const initials = initialsOf(name);
  const sizeClasses = size === "sm" ? "h-8 w-8 text-[11px]" : "h-10 w-10 text-sm";

  return (
    <div
      aria-hidden="true"
      className={`flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary to-primary-strong font-semibold text-primary-foreground ring-1 ring-white/10 ${sizeClasses} ${className}`}
    >
      {initials}
    </div>
  );
}

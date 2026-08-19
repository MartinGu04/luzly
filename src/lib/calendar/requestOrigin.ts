import "server-only";
import { headers } from "next/headers";
import { resolveOriginFromHeaders } from "./feedUrl";

/**
 * The current request's own scheme+host, read from `next/headers` --
 * usable from a Server Component render or a Server Action alike (both
 * run within the same incoming request/response cycle). `null` only when
 * no usable host header is present at all, which callers treat as "can't
 * build an absolute feed URL right now" rather than guessing one.
 */
export async function resolveRequestOrigin(): Promise<string | null> {
  const headerList = await headers();
  return resolveOriginFromHeaders(
    headerList.get("host"),
    headerList.get("x-forwarded-host"),
    headerList.get("x-forwarded-proto"),
  );
}

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * `/sw.js` (PR #28) must never be indefinitely hidden behind HTTP/browser
   * caching after a new production deploy -- the client's own
   * `updateViaCache: "none"` registration option (see
   * `components/pwa/ServiceWorkerManager`) already tells the BROWSER to
   * bypass its HTTP cache when re-checking the script, but an intermediate
   * cache (CDN/proxy) could still serve a stale copy without this. `no-cache`
   * forces a revalidation request every time rather than trusting any cached
   * copy outright, so a genuinely new deploy is picked up on the very next
   * check instead of staying invisible for an arbitrary cache lifetime.
   */
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          {
            key: "Cache-Control",
            value: "no-cache, no-store, must-revalidate",
          },
        ],
      },
    ];
  },
};

export default nextConfig;

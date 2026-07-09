import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    // Leads were renamed to Tickets — keep old links working.
    return [
      { source: "/leads", destination: "/tickets", permanent: true },
      { source: "/leads/:id", destination: "/tickets/:id", permanent: true },
    ];
  },
};

export default nextConfig;

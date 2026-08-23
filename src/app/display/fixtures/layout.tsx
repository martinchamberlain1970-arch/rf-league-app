import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "League Fixtures | Rack & Frame",
  description: "League fixture lists shared through Rack & Frame.",
  referrer: "no-referrer",
  robots: {
    index: false,
    follow: false,
    nocache: true,
  },
};

export default function PublicFixturesLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}

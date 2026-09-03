import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Public League Hub",
  description: "Fixtures, results, league tables, leading players and high breaks for the Gravesend & District Indoor Games League.",
  referrer: "no-referrer",
  robots: {
    index: false,
    follow: false,
    nocache: true,
  },
};

export default function LeagueHubLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}

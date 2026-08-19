import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Private Team Entry Pack",
  robots: { index: false, follow: false, nocache: true },
};

export default function EntryPackLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}

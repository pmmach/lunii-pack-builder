import type { Metadata } from "next";

export const metadata: Metadata = {
  title: { absolute: "Préparation du pack" },
  robots: { index: false, follow: false },
};

export default function PackSessionLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}

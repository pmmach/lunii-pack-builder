import type { Metadata } from "next";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import { getSiteUrl } from "@/lib/seo/request";
import { HOME_DESCRIPTION, HOME_TITLE, SITE_NAME } from "@/lib/seo/site";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const origin = await getSiteUrl();
  return {
    metadataBase: origin,
    title: {
      default: HOME_TITLE,
      template: `%s — ${SITE_NAME}`,
    },
    description: HOME_DESCRIPTION,
    applicationName: SITE_NAME,
    openGraph: {
      type: "website",
      locale: "fr_FR",
      siteName: SITE_NAME,
      title: HOME_TITLE,
      description: HOME_DESCRIPTION,
    },
    twitter: {
      card: "summary",
      title: HOME_TITLE,
      description: HOME_DESCRIPTION,
    },
    robots: { index: true, follow: true },
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr" suppressHydrationWarning>
      <body className="font-sans antialiased">
        <ThemeProvider>
          {children}
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}

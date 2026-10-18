import type { Metadata, Viewport } from "next";
import AppShell from "@/components/AppShell";
import { AuthProvider } from "@/lib/auth";
import { BRAND } from "@/lib/brand";
import "./globals.css";

// What shows up when the link is shared (the "preview card"), and in search results.
export const metadata: Metadata = {
  metadataBase: new URL(BRAND.url),
  title: BRAND.name,
  description: BRAND.description,
  openGraph: {
    type: "website",
    siteName: BRAND.name,
    title: BRAND.name,
    description: BRAND.description,
    url: "/",
    images: [{ url: "/logo.png", width: 256, height: 256, alt: `${BRAND.name} logo` }],
  },
  twitter: { card: "summary", title: BRAND.name, description: BRAND.description, images: ["/logo.png"] },
};

export const viewport: Viewport = {
  themeColor: "#43150e",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body className="font-sans antialiased">
        <AuthProvider>
          <AppShell>{children}</AppShell>
        </AuthProvider>
      </body>
    </html>
  );
}

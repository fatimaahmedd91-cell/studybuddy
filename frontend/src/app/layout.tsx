import type { Metadata, Viewport } from "next";
import AppShell from "@/components/AppShell";
import { AuthProvider } from "@/lib/auth";
import "./globals.css";

export const metadata: Metadata = {
  title: "Meerkat",
  description: "Finding your mob shouldn't be up to chance. Meerkat helps adults find platonic friends, groups and events through shared interests and free time.",
};

export const viewport: Viewport = {
  themeColor: "#1f3a2b",
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

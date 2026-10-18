import type { Metadata, Viewport } from "next";
import AppShell from "@/components/AppShell";
import { AuthProvider } from "@/lib/auth";
import "./globals.css";

export const metadata: Metadata = {
  title: "FriendFinder",
  description: "Find platonic friends, study buddies, groups and events on campus who share your interests and free time.",
};

export const viewport: Viewport = {
  themeColor: "#401800",
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

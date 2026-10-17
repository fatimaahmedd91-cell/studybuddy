import type { Metadata, Viewport } from "next";
import AppShell from "@/components/AppShell";
import { StoreProvider } from "@/lib/store";
import "./globals.css";

export const metadata: Metadata = {
  title: "FriendFinder",
  description: "Find study buddies and friends on campus who share your courses, interests, and free time.",
};

export const viewport: Viewport = {
  themeColor: "#401800",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body className="font-sans antialiased">
        <StoreProvider>
          <AppShell>{children}</AppShell>
        </StoreProvider>
      </body>
    </html>
  );
}

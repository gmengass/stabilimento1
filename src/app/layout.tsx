import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Stabilimento",
  description: "Beach spot booking",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="it" className="h-full antialiased">
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}

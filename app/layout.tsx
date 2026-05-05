import "./globals.css";
import ClientProviders from "./client/ClientProviders";
import { AppNavigation } from "@/components/AppNavigation";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <ClientProviders />
        <AppNavigation />
        {children}
      </body>
    </html>
  );
}

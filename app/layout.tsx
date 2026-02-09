import "./globals.css";
import ClientProviders from "./client/ClientProviders";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <ClientProviders />
        {children}
      </body>
    </html>
  );
}

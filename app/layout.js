import "./globals.css";
import { Providers } from "./providers";

export const metadata = {
  title: "Ledgerline",
  description: "A pocket expense tracker with monthly totals and category breakdowns.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Ledgerline"
  }
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#6c4ab6"
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}

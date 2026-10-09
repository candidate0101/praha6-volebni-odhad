import type { Metadata } from "next";
import localFont from "next/font/local";
import "./styles.css";

// Same faces as vysledkymistoslov.cz: Boldonse for display, Google Sans Flex for text and data.
// Both SIL Open Font License 1.1, taken from github.com/google/fonts and stored locally (see app/fonts/README.md).
const sans = localFont({
  src: [{ path: "./fonts/GoogleSansFlex-latin-ext.woff2", weight: "400 700", style: "normal" }],
  variable: "--font-sans-face",
  display: "swap",
});

const display = localFont({
  src: [{ path: "./fonts/Boldonse-Regular-latin-ext.woff2", weight: "400", style: "normal" }],
  variable: "--font-display-face",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Praha 6 · volební noc 2026",
  description: "Interní pracovní nástroj pro volební večer.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="cs" className={`${sans.variable} ${display.variable}`}><body>{children}</body></html>;
}

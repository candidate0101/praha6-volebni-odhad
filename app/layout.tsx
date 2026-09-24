import type { Metadata } from "next";
import "./styles.css";

export const metadata: Metadata = {
  title: "Praha 6 · volební briefing",
  description: "Interní pracovní nástroj pro volební večer.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="cs"><body>{children}</body></html>;
}

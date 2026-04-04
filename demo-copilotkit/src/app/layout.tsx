import type { ReactNode } from "react";

export const metadata = { title: "CopilotKit HITL Demo" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'OT Committee Org Board',
  description: 'OT Committee Coordination System — editable org board (slice 1a)',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

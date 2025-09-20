import type { Metadata } from 'next';
import ShareClient from './ShareClient';

export const metadata: Metadata = {
  title: 'Shared Item - Cloud Clipboard',
  robots: { index: false, follow: false },
};

export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <ShareClient token={token} />;
}

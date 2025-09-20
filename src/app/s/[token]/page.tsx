import type { Metadata } from 'next';
import ShareClient from './ShareClient';

export const metadata: Metadata = {
  title: 'Shared Item - Cloud Clipboard',
  robots: { index: false, follow: false },
};

export default function Page({ params }: { params: { token: string } }) {
  return <ShareClient token={params.token} />;
}


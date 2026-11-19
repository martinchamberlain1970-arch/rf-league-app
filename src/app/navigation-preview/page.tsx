import { notFound } from 'next/navigation';
import NavigationPreview from './preview';
export const metadata = { title: 'Menu design preview · Rack & Frame', robots: { index: false, follow: false } };
export default function Page() {
  if (process.env.VERCEL_ENV !== 'preview' && process.env.NODE_ENV !== 'development') notFound();
  return <NavigationPreview />;
}

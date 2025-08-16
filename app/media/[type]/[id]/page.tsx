// app/media/[type]/[id]/page.tsx
import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { MediaPageClient } from '@/components/MediaPageClient';

interface MediaPageProps {
  params: {
    type: string;
    id: string;
  };
}

// Validate media type at runtime
function isValidMediaType(type: string): type is "movie" | "tv" | "game" | "music" {
  return ['movie', 'tv', 'game', 'music'].includes(type);
}

export default function MediaPage({ params }: MediaPageProps) {
  const { type, id } = params;
  
  if (!isValidMediaType(type)) {
    notFound();
  }
  
  return <MediaPageClient type={type} externalId={id} />;
}

// Generate metadata for SEO
export async function generateMetadata({ params }: MediaPageProps): Promise<Metadata> {
  const { type, id } = params;
 
  if (!isValidMediaType(type)) {
    return { title: 'Media Not Found - STACKD' };
  }
  
  return {
    title: `${type.charAt(0).toUpperCase() + type.slice(1)} Details - STACKD`,
    description: `View details, reviews, and logs for this ${type} on STACKD`,
  };
}
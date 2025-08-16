// components/MediaPageClient.tsx
"use client";

import { useQuery, useMutation } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { useState } from 'react';
import { MediaDisplay } from '@/components/MediaDisplay';
import { MediaPageSkeleton } from '@/components/MediaPageSkeleton';

interface MediaPageClientProps {
  type: "movie" | "tv" | "game" | "music";
  externalId: string;
}

export function MediaPageClient({ type, externalId }: MediaPageClientProps) {
  const [isCreating, setIsCreating] = useState(false);
  
  // First check if media exists in cache
  const existingMedia = useQuery(api.media.mediaQueries.getMediaByExternalId, {
    externalId,
    type
  });
  
  const createMedia = useMutation(api.media.mediaQueries.getOrCreateMediaFromSearch);

  // If media doesn't exist, we need to fetch and create it
  // In a real app, you'd call your API fetching action here
  const handleCreateMedia = async () => {
    if (isCreating) return;
    
    setIsCreating(true);
    try {
      // This is where you'd call your API fetching functions
      // For now, we'll create a placeholder
      await createMedia({
        externalId,
        type,
        title: `${type} ${externalId}`, // Placeholder - replace with API data
        releaseYear: new Date().getFullYear(),
        posterUrl: "/placeholder-poster.jpg", // You'll need to add this image
        description: `Loading ${type} details...`,
      });
    } catch (error) {
      console.error('Failed to create media:', error);
      // Handle error - maybe show an error component
    } finally {
      setIsCreating(false);
    }
  };

  // Show loading state
  if (existingMedia === undefined) {
    return <MediaPageSkeleton />;
  }

  // If media doesn't exist, try to create it
  if (existingMedia === null) {
    if (!isCreating) {
      handleCreateMedia();
    }
    return <MediaPageSkeleton />;
  }

  return <MediaDisplay media={existingMedia} />;
}
// components/MediaLink.tsx
import Link from 'next/link';
import Image from 'next/image';
import { MediaSearchResult } from '@/convex/lib/apiHelpers';
import { Doc } from '@/convex/_generated/dataModel';

// Type for media items (either from search or database)
type MediaItem = MediaSearchResult | Doc<"media">;

interface MediaLinkProps {
  media: MediaItem;
  showTitle?: boolean;
  className?: string;
  imageClassName?: string;
}

export function MediaLink({ media, showTitle = true, className = "", imageClassName = "" }: MediaLinkProps) {
  // Generate the dynamic URL based on media type and external ID
  const mediaUrl = `/media/${media.type}/${media.externalId}`;

  return (
    <Link 
      href={mediaUrl} 
      className={`block hover:opacity-80 transition-opacity ${className}`}
    >
      <div className="space-y-2">
        <div className={`relative aspect-[2/3] overflow-hidden rounded-lg ${imageClassName}`}>
          <Image
            src={media.posterUrl}
            alt={media.title}
            fill
            className="object-cover"
            sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
          />
        </div>
        
        {showTitle && (
          <div className="space-y-1">
            <h3 className="font-medium text-sm line-clamp-2">
              {media.title}
            </h3>
            <div className="text-xs text-gray-500 flex items-center gap-2">
              <span>{media.releaseYear}</span>
              {media.artist && (
                <>
                  <span>•</span>
                  <span>{media.artist}</span>
                </>
              )}
              {media.season && (
                <>
                  <span>•</span>
                  <span>Season {media.season}</span>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </Link>
  );
}
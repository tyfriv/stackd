// components/MediaDisplay.tsx
"use client";

import { Doc } from '@/convex/_generated/dataModel';
import Image from 'next/image';
import { MediaStats } from '@/components/MediaStats';
import { AddToLogButton } from '@/components/AddToLogButton';
import { MediaReviews } from '@/components/MediaReviews';
import { AddReviewForm } from '@/components/AddReviewForm';

interface MediaDisplayProps {
  media: Doc<"media">;
}

export function MediaDisplay({ media }: MediaDisplayProps) {
  return (
    <div className="container mx-auto px-4 py-8 space-y-8">
      {/* Header Section */}
      <div className="flex flex-col lg:flex-row gap-8">
        {/* Poster */}
        <div className="flex-shrink-0">
          <div className="w-64 h-96 relative overflow-hidden rounded-lg shadow-lg mx-auto lg:mx-0">
            <Image
              src={media.posterUrl}
              alt={media.title}
              fill
              className="object-cover"
              priority
              sizes="256px"
            />
          </div>
        </div>

        {/* Details */}
        <div className="flex-1 space-y-6">
          <div>
            <h1 className="text-4xl font-bold text-gray-900 mb-2">
              {media.title}
            </h1>
            <div className="flex flex-wrap items-center gap-4 text-gray-600">
              <span className="text-lg font-medium">{media.releaseYear}</span>
              {media.artist && (
                <>
                  <span className="text-gray-400">•</span>
                  <span className="text-lg">by {media.artist}</span>
                </>
              )}
              {media.season && (
                <>
                  <span className="text-gray-400">•</span>
                  <span className="text-lg">Season {media.season}</span>
                </>
              )}
              <span className="px-2 py-1 bg-gray-100 text-gray-700 text-sm rounded-full capitalize">
                {media.type}
              </span>
            </div>
          </div>

          {/* Description */}
          {media.description && (
            <div>
              <h2 className="text-xl font-semibold text-gray-900 mb-3">
                Overview
              </h2>
              <p className="text-gray-700 leading-relaxed text-lg">
                {media.description}
              </p>
            </div>
          )}

          {/* Stats */}
          <MediaStats mediaId={media._id} />

          {/* Quick Actions */}
          <div className="flex flex-wrap gap-3">
            <AddToLogButton media={media} />
            <AddToWatchlistButton media={media} />
          </div>
        </div>
      </div>

      {/* Reviews Section */}
      <div className="space-y-6">
        <div className="border-t pt-8">
          <h2 className="text-2xl font-bold text-gray-900 mb-6">
            Reviews & Activity
          </h2>
          
          {/* Add Review Form */}
          <div className="mb-8">
            <AddReviewForm mediaId={media._id} />
          </div>
          
          {/* Existing Reviews */}
          <MediaReviews mediaId={media._id} />
        </div>
      </div>
    </div>
  );
}

// Simple placeholder button for watchlist
function AddToWatchlistButton({ media }: { media: Doc<"media"> }) {
  return (
    <button className="px-6 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 transition-colors">
      Add to Watchlist
    </button>
  );
}
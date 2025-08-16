// components/MediaReviews.tsx
"use client";
import { useState } from 'react';
import { useQuery } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { Id } from '@/convex/_generated/dataModel';
import { StarRating } from '@/components/StarRating';
import { formatDistanceToNow } from 'date-fns';
import Link from 'next/link';
import Image from 'next/image';

interface MediaReviewsProps {
  mediaId: Id<"media">;
}

export function MediaReviews({ mediaId }: MediaReviewsProps) {
  const logsData = useQuery(api.logs.logOperations.getMediaLogs, { 
    mediaId,
    limit: 20 
  });

  if (logsData === undefined) {
    return <MediaReviewsSkeleton />;
  }

  if (!logsData?.logs || logsData.logs.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        <p>No reviews yet. Be the first to share your thoughts!</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {logsData.logs.map((log) => (
        <ReviewCard key={log._id} log={log} />
      ))}
      
      {logsData.hasMore && (
        <div className="text-center py-4">
          <button className="px-4 py-2 text-blue-600 hover:text-blue-700 font-medium">
            Load more reviews
          </button>
        </div>
      )}
    </div>
  );
}

interface ReviewCardProps {
  log: any; // This should match the return type from getMediaLogs
}

function ReviewCard({ log }: ReviewCardProps) {
  const hasReview = log.review && log.review.trim();
  const timeAgo = formatDistanceToNow(new Date(log.loggedAt), { addSuffix: true });

  return (
    <div className="border rounded-lg p-4 bg-white">
      <div className="flex items-start gap-3">
        {/* User Avatar */}
        <div className="flex-shrink-0">
          {log.author?.profileImage ? (
            <Image
              src={log.author.profileImage}
              alt={log.author.username}
              width={40}
              height={40}
              className="w-10 h-10 rounded-full"
            />
          ) : (
            <div className="w-10 h-10 bg-gray-200 rounded-full flex items-center justify-center">
              <span className="text-gray-600 font-medium">
                {log.author?.username?.[0]?.toUpperCase() || '?'}
              </span>
            </div>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2">
            <Link 
              href={`/user/${log.author?.username}`}
              className="font-medium text-gray-900 hover:text-blue-600"
            >
              {log.author?.username || 'Anonymous'}
            </Link>
            
            {log.rating && (
              <>
                <span className="text-gray-400">•</span>
                <div className="flex items-center gap-1">
                  <StarRating rating={log.rating} readonly size="sm" />
                  <span className="text-sm text-gray-600">
                    {log.rating}/10
                  </span>
                </div>
              </>
            )}
            
            <span className="text-gray-400">•</span>
            <span className="text-sm text-gray-500">{timeAgo}</span>
          </div>

          {hasReview ? (
            <div className="space-y-2">
              {log.hasSpoilers ? (
                <SpoilerReview review={log.review} />
              ) : (
                <p className="text-gray-700 leading-relaxed">
                  {log.review}
                </p>
              )}
            </div>
          ) : (
            <p className="text-gray-500 italic">
              Logged without a review
            </p>
          )}

          {/* Reactions and actions would go here */}
          <div className="flex items-center gap-4 mt-3 text-sm">
            <button className="text-gray-500 hover:text-blue-600 flex items-center gap-1">
              👍 Like
            </button>
            <button className="text-gray-500 hover:text-blue-600 flex items-center gap-1">
              💬 Reply
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function SpoilerReview({ review }: { review: string }) {
  const [isRevealed, setIsRevealed] = useState(false);

  if (isRevealed) {
    return (
      <div className="space-y-2">
        <p className="text-gray-700 leading-relaxed">{review}</p>
        <button
          onClick={() => setIsRevealed(false)}
          className="text-sm text-blue-600 hover:text-blue-700"
        >
          Hide spoilers
        </button>
      </div>
    );
  }

  return (
    <div className="bg-gray-100 rounded-md p-3 text-center">
      <p className="text-gray-600 mb-2">⚠️ This review contains spoilers</p>
      <button
        onClick={() => setIsRevealed(true)}
        className="px-3 py-1 bg-gray-600 text-white text-sm rounded hover:bg-gray-700"
      >
        Show spoilers
      </button>
    </div>
  );
}

function MediaReviewsSkeleton() {
  return (
    <div className="space-y-4">
      {[1, 2, 3].map((i) => (
        <div key={i} className="border rounded-lg p-4 animate-pulse">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 bg-gray-200 rounded-full"></div>
            <div className="flex-1 space-y-2">
              <div className="flex items-center gap-2">
                <div className="h-4 bg-gray-200 rounded w-24"></div>
                <div className="h-4 bg-gray-200 rounded w-20"></div>
                <div className="h-4 bg-gray-200 rounded w-16"></div>
              </div>
              <div className="space-y-1">
                <div className="h-4 bg-gray-200 rounded"></div>
                <div className="h-4 bg-gray-200 rounded w-5/6"></div>
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// You'll need to install date-fns
// npm install date-fns
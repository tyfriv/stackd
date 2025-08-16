// components/MediaStats.tsx
"use client";

import { useQuery } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { Id } from '@/convex/_generated/dataModel';
import { StarRating } from '@/components/StarRating';

interface MediaStatsProps {
  mediaId: Id<"media">;
}

export function MediaStats({ mediaId }: MediaStatsProps) {
  // You'll need to create this query in your convex/logs/ folder
  const stats = useQuery(api.logs.logOperations.getMediaStats, { mediaId });
  
  if (stats === undefined) {
    // Loading state
    return (
      <div className="animate-pulse space-y-3">
        <div className="flex items-center gap-3">
          <div className="h-5 bg-gray-200 rounded w-24"></div>
          <div className="h-5 bg-gray-200 rounded w-16"></div>
        </div>
        <div className="h-4 bg-gray-200 rounded w-32"></div>
      </div>
    );
  }

  if (!stats || stats.totalLogs === 0) {
    return (
      <div className="text-gray-500">
        No logs yet. Be the first to log this!
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {stats.averageRating > 0 && (
        <div className="flex items-center gap-3">
          <StarRating rating={stats.averageRating} readonly size="md" />
          <span className="text-lg font-semibold text-gray-900">
            {stats.averageRating.toFixed(1)}
          </span>
          <span className="text-gray-500">
            • {stats.totalReviews} {stats.totalReviews === 1 ? 'review' : 'reviews'}
          </span>
        </div>
      )}
      
      <div className="text-gray-600">
        {stats.totalLogs} {stats.totalLogs === 1 ? 'person has' : 'people have'} logged this
      </div>
    </div>
  );
}
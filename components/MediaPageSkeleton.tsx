// components/MediaPageSkeleton.tsx
export function MediaPageSkeleton() {
  return (
    <div className="container mx-auto px-4 py-8">
      <div className="animate-pulse space-y-8">
        {/* Header Section */}
        <div className="flex flex-col lg:flex-row gap-8">
          {/* Poster Skeleton */}
          <div className="flex-shrink-0">
            <div className="w-64 h-96 bg-gray-300 rounded-lg mx-auto lg:mx-0"></div>
          </div>

          {/* Details Skeleton */}
          <div className="flex-1 space-y-6">
            {/* Title */}
            <div className="space-y-2">
              <div className="h-8 bg-gray-300 rounded w-3/4"></div>
              <div className="h-5 bg-gray-200 rounded w-1/2"></div>
            </div>

            {/* Description */}
            <div className="space-y-3">
              <div className="h-6 bg-gray-300 rounded w-1/4"></div>
              <div className="space-y-2">
                <div className="h-4 bg-gray-200 rounded"></div>
                <div className="h-4 bg-gray-200 rounded"></div>
                <div className="h-4 bg-gray-200 rounded w-3/4"></div>
              </div>
            </div>

            {/* Stats */}
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="h-5 bg-gray-200 rounded w-24"></div>
                <div className="h-5 bg-gray-200 rounded w-16"></div>
              </div>
              <div className="h-4 bg-gray-200 rounded w-32"></div>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-3">
              <div className="h-10 bg-gray-300 rounded w-32"></div>
              <div className="h-10 bg-gray-200 rounded w-36"></div>
            </div>
          </div>
        </div>

        {/* Reviews Section */}
        <div className="border-t pt-8 space-y-6">
          <div className="h-8 bg-gray-300 rounded w-48"></div>
          
          {/* Add Review Form Skeleton */}
          <div className="space-y-4 p-4 bg-gray-50 rounded-lg">
            <div className="h-6 bg-gray-200 rounded w-32"></div>
            <div className="h-20 bg-gray-200 rounded"></div>
            <div className="h-10 bg-gray-300 rounded w-24"></div>
          </div>

          {/* Review Items Skeleton */}
          {[1, 2, 3].map((i) => (
            <div key={i} className="border rounded-lg p-4 space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-gray-200 rounded-full"></div>
                <div className="h-4 bg-gray-200 rounded w-24"></div>
                <div className="h-4 bg-gray-200 rounded w-16"></div>
              </div>
              <div className="space-y-2">
                <div className="h-4 bg-gray-200 rounded"></div>
                <div className="h-4 bg-gray-200 rounded w-5/6"></div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
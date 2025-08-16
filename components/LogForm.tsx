// components/LogForm.tsx
'use client';
import React, { useState, useEffect } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { api } from '../convex/_generated/api';

interface MediaItem {
  _id: string;
  title: string;
  releaseYear: number;
  posterUrl: string;
  type: 'movie' | 'tv' | 'game' | 'music';
  artist?: string;
}

interface LogFormProps {
  media: MediaItem; // Always require the full media object
  existingLog?: any; // Pass existing log data for editing
  onSuccess?: () => void;
  onCancel?: () => void;
}

const LogForm: React.FC<LogFormProps> = ({ 
  media,
  existingLog, 
  onSuccess, 
  onCancel 
}) => {
  // Form state
  const [rating, setRating] = useState<number | null>(existingLog?.rating || null);
  const [review, setReview] = useState(existingLog?.review || '');
  const [hasSpoilers, setHasSpoilers] = useState(existingLog?.hasSpoilers || false);
  const [visibility, setVisibility] = useState(existingLog?.visibility || 'public');
  const [loggedAt, setLoggedAt] = useState(
    existingLog?.loggedAt 
      ? new Date(existingLog.loggedAt).toISOString().split('T')[0]
      : new Date().toISOString().split('T')[0]
  );
  
  // UI state
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hoverRating, setHoverRating] = useState<number | null>(null);

  // Mutations
  const createLog = useMutation(api.logs.logOperations.createLog);
  const updateLog = useMutation(api.logs.logOperations.updateLog);

  const isEditing = !!existingLog;

  // Rating component helpers
  const renderStars = () => {
    const stars = [];
    const displayRating = hoverRating !== null ? hoverRating : (rating || 0);
    
    for (let i = 0; i < 5; i++) {
      const starValue = (i + 1) * 2; // Each star represents 2 points (out of 10)
      const halfStarValue = starValue - 1;
      
      stars.push(
        <div key={i} className="relative inline-block cursor-pointer">
          {/* Full star background */}
          <svg
            className="w-8 h-8 text-gray-300"
            fill="currentColor"
            viewBox="0 0 24 24"
          >
            <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
          </svg>
          
          {/* Half star overlay */}
          {displayRating >= halfStarValue && (
            <svg
              className={`absolute top-0 left-0 w-8 h-8 overflow-hidden ${
                displayRating >= starValue ? 'text-yellow-400' : 'text-yellow-400'
              }`}
              style={{ 
                clipPath: displayRating >= starValue ? 'none' : 'polygon(0 0, 50% 0, 50% 100%, 0 100%)' 
              }}
              fill="currentColor"
              viewBox="0 0 24 24"
            >
              <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
            </svg>
          )}
          
          {/* Full star overlay */}
          {displayRating >= starValue && (
            <svg
              className="absolute top-0 left-0 w-8 h-8 text-yellow-400"
              fill="currentColor"
              viewBox="0 0 24 24"
            >
              <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
            </svg>
          )}
          
          {/* Click handlers for half and full stars */}
          <div
            className="absolute top-0 left-0 w-1/2 h-full cursor-pointer"
            onClick={() => setRating(halfStarValue)}
            onMouseEnter={() => setHoverRating(halfStarValue)}
            onMouseLeave={() => setHoverRating(null)}
          />
          <div
            className="absolute top-0 right-0 w-1/2 h-full cursor-pointer"
            onClick={() => setRating(starValue)}
            onMouseEnter={() => setHoverRating(starValue)}
            onMouseLeave={() => setHoverRating(null)}
          />
        </div>
      );
    }
    
    return stars;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const logData = {
        rating: rating || undefined,
        review: review.trim() || undefined,
        hasSpoilers,
        visibility,
        loggedAt: new Date(loggedAt).getTime(),
      };

      if (isEditing && existingLog) {
        await updateLog({
          logId: existingLog._id,
          ...logData,
        });
      } else {
        await createLog({
          mediaId: media._id as any, // Type assertion for Convex ID
          ...logData,
        });
      }

      onSuccess?.();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const clearRating = () => {
    setRating(null);
    setHoverRating(null);
  };

  const getActionText = (type?: string) => {
    switch (type) {
      case 'movie':
      case 'tv':
        return 'watch this';
      case 'game':
        return 'play this';
      case 'music':
        return 'listen to this';
      default:
        return 'experience this';
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-lg p-6 max-w-2xl mx-auto">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">
          {isEditing ? 'Edit Log' : 'Log Media'}
        </h2>
        {media && (
          <div className="flex items-center gap-3">
            <img 
              src={media.posterUrl} 
              alt={media.title}
              className="w-12 h-16 object-cover rounded"
            />
            <div>
              <h3 className="font-semibold text-gray-800">{media.title}</h3>
              <p className="text-sm text-gray-600">
                {media.releaseYear}
                {media.artist && ` • ${media.artist}`}
              </p>
            </div>
          </div>
        )}
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Date */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            When did you {getActionText(media?.type)}?
          </label>
          <input
            type="date"
            value={loggedAt}
            onChange={(e) => setLoggedAt(e.target.value)}
            className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            required
          />
        </div>

        {/* Rating */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="block text-sm font-medium text-gray-700">
              Rating (optional)
            </label>
            {rating && (
              <button
                type="button"
                onClick={clearRating}
                className="text-xs text-gray-500 hover:text-red-600"
              >
                Clear rating
              </button>
            )}
          </div>
          
          <div className="flex items-center gap-2 mb-2">
            {renderStars()}
            {rating && (
              <span className="text-sm text-gray-600 ml-2">
                {rating}/10
              </span>
            )}
          </div>
          
          <p className="text-xs text-gray-500">
            Click on the left half of a star for half ratings (e.g., 3.5/10)
          </p>
        </div>

        {/* Review */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Review (optional)
          </label>
          <textarea
            value={review}
            onChange={(e) => setReview(e.target.value)}
            placeholder="Share your thoughts..."
            rows={4}
            className="w-full p-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-vertical"
          />
        </div>

        {/* Spoilers checkbox (only show if there's a review) */}
        {review.trim() && (
          <div className="flex items-center">
            <input
              type="checkbox"
              id="hasSpoilers"
              checked={hasSpoilers}
              onChange={(e) => setHasSpoilers(e.target.checked)}
              className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
            />
            <label htmlFor="hasSpoilers" className="ml-2 text-sm text-gray-700">
              This review contains spoilers
            </label>
          </div>
        )}

        {/* Visibility */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Who can see this?
          </label>
          <select
            value={visibility}
            onChange={(e) => setVisibility(e.target.value)}
            className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="public">🌍 Public - Everyone can see</option>
            <option value="followers">👥 Followers - Only people you follow</option>
            <option value="private">🔒 Private - Only you</option>
          </select>
        </div>

        {/* Error message */}
        {error && (
          <div className="p-3 bg-red-100 border border-red-400 text-red-700 rounded">
            {error}
          </div>
        )}

        {/* Action buttons */}
        <div className="flex gap-3 pt-4">
          <button
            type="submit"
            disabled={loading}
            className="flex-1 bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 disabled:opacity-50 font-medium"
          >
            {loading ? 'Saving...' : (isEditing ? 'Update Log' : 'Save Log')}
          </button>
          
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2 text-gray-600 border border-gray-300 rounded-md hover:bg-gray-50"
            >
              Cancel
            </button>
          )}
        </div>
      </form>
    </div>
  );
};

export default LogForm;
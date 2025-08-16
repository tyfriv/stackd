// components/AddReviewForm.tsx
"use client";

import { useState } from 'react';
import { useMutation } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { Id } from '@/convex/_generated/dataModel';
import { useUser } from '@clerk/nextjs';
import { StarRating } from '@/components/StarRating';

interface AddReviewFormProps {
  mediaId: Id<"media">;
  onSuccess?: () => void;
}

export function AddReviewForm({ mediaId, onSuccess }: AddReviewFormProps) {
  const { user } = useUser();
  const [isOpen, setIsOpen] = useState(false);
  const [rating, setRating] = useState<number>(0);
  const [review, setReview] = useState('');
  const [hasSpoilers, setHasSpoilers] = useState(false);
  const [visibility, setVisibility] = useState<'public' | 'followers' | 'private'>('public');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const createLog = useMutation(api.logs.logOperations.createLog);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || isSubmitting) return;

    setIsSubmitting(true);
    try {
      await createLog({
        mediaId,
        rating: rating > 0 ? rating : undefined,
        review: review.trim() || undefined,
        hasSpoilers,
        visibility,
        loggedAt: Date.now(),
      });

      // Reset form
      setRating(0);
      setReview('');
      setHasSpoilers(false);
      setVisibility('public');
      setIsOpen(false);
      
      onSuccess?.();
      console.log('✅ Review added successfully');
    } catch (error) {
      console.error('Failed to add review:', error);
      alert('Failed to add review. You may have already logged this item.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!user) {
    return (
      <div className="text-center py-8 bg-gray-50 rounded-lg">
        <p className="text-gray-600 mb-4">Sign in to add a review</p>
        <button className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700">
          Sign In
        </button>
      </div>
    );
  }

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="w-full py-3 border-2 border-dashed border-gray-300 text-gray-600 rounded-lg hover:border-blue-400 hover:text-blue-600 transition-colors"
      >
        + Add your review
      </button>
    );
  }

  return (
    <div className="border rounded-lg p-4 bg-white">
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Rating */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Rating (optional)
          </label>
          <div className="flex items-center gap-4">
            <StarRating 
              rating={rating} 
              onChange={setRating} 
              size="lg" 
            />
            {rating > 0 && (
              <span className="text-sm text-gray-600">
                {rating}/10
              </span>
            )}
          </div>
        </div>

        {/* Review Text */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Review (optional)
          </label>
          <textarea
            value={review}
            onChange={(e) => setReview(e.target.value)}
            rows={4}
            className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="What did you think?"
          />
        </div>

        {/* Spoilers checkbox */}
        {review.trim() && (
          <div className="flex items-center">
            <input
              type="checkbox"
              id="hasSpoilers"
              checked={hasSpoilers}
              onChange={(e) => setHasSpoilers(e.target.checked)}
              className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <label htmlFor="hasSpoilers" className="ml-2 text-sm text-gray-700">
              This review contains spoilers
            </label>
          </div>
        )}

        {/* Visibility */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Visibility
          </label>
          <select
            value={visibility}
            onChange={(e) => setVisibility(e.target.value as 'public' | 'followers' | 'private')}
            className="border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="public">Public</option>
            <option value="followers">Followers only</option>
            <option value="private">Private</option>
          </select>
        </div>

        {/* Action buttons */}
        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={() => setIsOpen(false)}
            className="px-4 py-2 text-gray-600 border border-gray-300 rounded-md hover:bg-gray-50"
            disabled={isSubmitting}
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSubmitting}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {isSubmitting ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                Adding...
              </>
            ) : (
              'Add Log'
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
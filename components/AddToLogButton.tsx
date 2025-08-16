// components/AddToLogButton.tsx
"use client";

import { useState } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { Doc } from '@/convex/_generated/dataModel';
import { useUser } from '@clerk/nextjs';

interface AddToLogButtonProps {
  media: Doc<"media">;
}

export function AddToLogButton({ media }: AddToLogButtonProps) {
  const { user } = useUser();
  const [isLogging, setIsLogging] = useState(false);
  
  // Check if user already has a log for this media
  const existingRating = useQuery(
    api.logs.logOperations.getUserMediaRating, 
    user ? { mediaId: media._id } : "skip"
  );
  
  const createLog = useMutation(api.logs.logOperations.createLog);

  const handleAddToLog = async () => {
    if (!user || isLogging) return;
    
    setIsLogging(true);
    try {
      await createLog({
        mediaId: media._id,
        visibility: "public",
        loggedAt: Date.now(),
      });
      // Show success message or toast here
      console.log('✅ Added to log successfully');
    } catch (error) {
      console.error('Failed to add log:', error);
      // Show error message or toast here
      alert('Failed to add to log. You may have already logged this item.');
    } finally {
      setIsLogging(false);
    }
  };

  if (!user) {
    return (
      <button 
        disabled
        className="px-6 py-2 bg-gray-300 text-gray-500 rounded-md cursor-not-allowed"
      >
        Log In to Add
      </button>
    );
  }

  // If user already has this logged, show different state
  if (existingRating !== undefined && existingRating !== null) {
    return (
      <button
        disabled
        className="px-6 py-2 bg-green-100 text-green-700 rounded-md cursor-not-allowed flex items-center gap-2"
      >
        ✓ Already Logged
      </button>
    );
  }

  return (
    <button
      onClick={handleAddToLog}
      disabled={isLogging}
      className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
    >
      {isLogging ? (
        <>
          <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
          Adding...
        </>
      ) : (
        'Add to Log'
      )}
    </button>
  );
}
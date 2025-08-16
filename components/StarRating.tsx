// components/StarRating.tsx
"use client";

interface StarRatingProps {
  rating: number; // 0-10 (half stars supported)
  readonly?: boolean;
  size?: 'sm' | 'md' | 'lg';
  onChange?: (rating: number) => void;
}

export function StarRating({ rating, readonly = false, size = 'md', onChange }: StarRatingProps) {
  const sizeClasses = {
    sm: 'w-4 h-4',
    md: 'w-5 h-5', 
    lg: 'w-6 h-6'
  };

  const stars = [];
  const fullStars = Math.floor(rating / 2); // Convert 10-point to 5-point
  const hasHalfStar = (rating % 2) !== 0;

  for (let i = 0; i < 5; i++) {
    const starRating = (i + 1) * 2; // Convert back to 10-point scale
    
    if (i < fullStars) {
      // Full star
      stars.push(
        <button
          key={i}
          type="button"
          disabled={readonly}
          onClick={() => !readonly && onChange?.(starRating)}
          className={`${sizeClasses[size]} text-yellow-400 ${!readonly ? 'hover:text-yellow-500 cursor-pointer' : ''} transition-colors`}
          aria-label={`Rate ${starRating} out of 10`}
        >
          ★
        </button>
      );
    } else if (i === fullStars && hasHalfStar) {
      // Half star
      stars.push(
        <button
          key={i}
          type="button"
          disabled={readonly}
          onClick={() => !readonly && onChange?.(starRating - 1)}
          className={`${sizeClasses[size]} text-yellow-400 ${!readonly ? 'hover:text-yellow-500 cursor-pointer' : ''} transition-colors relative`}
          aria-label={`Rate ${starRating - 1} out of 10`}
        >
          <span className="absolute inset-0">☆</span>
          <span className="absolute inset-0 overflow-hidden w-1/2">★</span>
        </button>
      );
    } else {
      // Empty star
      stars.push(
        <button
          key={i}
          type="button"
          disabled={readonly}
          onClick={() => !readonly && onChange?.(starRating)}
          className={`${sizeClasses[size]} text-gray-300 ${!readonly ? 'hover:text-yellow-400 cursor-pointer' : ''} transition-colors`}
          aria-label={`Rate ${starRating} out of 10`}
        >
          ☆
        </button>
      );
    }
  }

  return (
    <div className="flex items-center gap-0.5" role="radiogroup" aria-label="Rating">
      {stars}
    </div>
  );
}
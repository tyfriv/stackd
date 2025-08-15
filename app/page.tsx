'use client'
import { Authenticated, Unauthenticated } from 'convex/react'
import { SignInButton, UserButton } from '@clerk/nextjs'
import { useQuery, useMutation, useAction } from 'convex/react'
import { api } from '../convex/_generated/api'
import { useEffect, useState } from 'react'

function TMDBTest() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Actions for testing
  const searchMovies = useAction(api.media.tmdb.searchMovies);
  const searchTV = useAction(api.media.tmdb.searchTVShows);

  const handleMovieSearch = async () => {
    if (!query.trim()) return;
    
    setLoading(true);
    setError(null);
    try {
      const movieResults = await searchMovies({ query });
      setResults(movieResults);
      console.log('Movie results:', movieResults);
    } catch (err: any) {
      setError(err.message);
      console.error('Movie search error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleTVSearch = async () => {
    if (!query.trim()) return;
    
    setLoading(true);
    setError(null);
    try {
      const tvResults = await searchTV({ query });
      setResults(tvResults);
      console.log('TV results:', tvResults);
    } catch (err: any) {
      setError(err.message);
      console.error('TV search error:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-4 border rounded mt-4">
      <h3 className="text-lg font-bold mb-3">🧪 Test TMDB API</h3>
      
      <div className="flex gap-2 mb-3">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search for movies or TV shows..."
          className="flex-1 p-2 border rounded"
          onKeyPress={(e) => e.key === 'Enter' && handleMovieSearch()}
        />
        <button 
          onClick={handleMovieSearch}
          disabled={loading}
          className="px-4 py-2 bg-blue-500 text-white rounded disabled:opacity-50"
        >
          Movies
        </button>
        <button 
          onClick={handleTVSearch}
          disabled={loading}
          className="px-4 py-2 bg-green-500 text-white rounded disabled:opacity-50"
        >
          TV Shows
        </button>
      </div>

      {loading && <p>Searching... ⏳</p>}
      {error && <p className="text-red-500">Error: {error}</p>}
      
      {results.length > 0 && (
        <div className="mt-4">
          <h4 className="font-semibold mb-2">Results ({results.length}):</h4>
          <div className="grid gap-2 max-h-60 overflow-y-auto">
            {results.map((item, i) => (
              <div key={i} className="flex items-center gap-3 p-2 border rounded">
                {item.posterUrl && (
                  <img 
                    src={item.posterUrl} 
                    alt={item.title}
                    className="w-12 h-16 object-cover rounded"
                  />
                )}
                <div className="flex-1">
                  <div className="font-medium">{item.title}</div>
                  <div className="text-sm text-gray-600">
                    {item.releaseYear} • {item.type}
                    {item.season && ` • Season ${item.season}`}
                  </div>
                  {item.description && (
                    <div className="text-xs text-gray-500 mt-1">
                      {item.description.substring(0, 100)}...
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function AuthenticatedContent() {
  const user = useQuery(api.users.getCurrentUser);
  const createUser = useMutation(api.users.createUserIfNotExists);
  
  useEffect(() => {
    if (user === null) {
      createUser();
    }
  }, [user, createUser]);

  return (
    <div className="p-8">
      <div className="flex items-center gap-4 mb-6">
        <UserButton />
        {user && <div>Welcome {user.username}! 🎉</div>}
        {user === null && <div>Setting up your account...</div>}
      </div>
      
      {/* Only show test component when user is loaded */}
      {user && <TMDBTest />}
    </div>
  );
}

export default function Home() {
  return (
    <>
      <Authenticated>
        <AuthenticatedContent />
      </Authenticated>
      <Unauthenticated>
        <div className="p-8">
          <SignInButton />
        </div>
      </Unauthenticated>
    </>
  )
}
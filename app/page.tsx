'use client'
import { Authenticated, Unauthenticated } from 'convex/react'
import { SignInButton, UserButton } from '@clerk/nextjs'
import { useQuery, useMutation, useAction } from 'convex/react'
import { api } from '../convex/_generated/api'
import { useEffect, useState } from 'react'

function MediaTest() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastSearchType, setLastSearchType] = useState<string>('');

  // TMDB Actions
  const searchMovies = useAction(api.media.tmdb.searchMovies);
  const searchTV = useAction(api.media.tmdb.searchTVShows);
  
  // RAWG Actions
  const searchGames = useAction(api.media.rawg.searchGames);
  const getTrendingGames = useAction(api.media.rawg.getTrendingGames);

  // Spotify Actions
  const searchMusic = useAction(api.media.spotify.searchMusic);
  const searchAlbums = useAction(api.media.spotify.searchAlbums);

  const handleMovieSearch = async () => {
    if (!query.trim()) return;
    
    setLoading(true);
    setError(null);
    setLastSearchType('movies');
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
    setLastSearchType('tv');
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

  const handleGameSearch = async () => {
    if (!query.trim()) return;
    
    setLoading(true);
    setError(null);
    setLastSearchType('games');
    try {
      const gameResults = await searchGames({ query });
      setResults(gameResults);
      console.log('Game results:', gameResults);
    } catch (err: any) {
      setError(err.message);
      console.error('Game search error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleMusicSearch = async () => {
    if (!query.trim()) return;
    
    setLoading(true);
    setError(null);
    setLastSearchType('music');
    try {
      const musicResults = await searchMusic({ query });
      setResults(musicResults);
      console.log('Music results:', musicResults);
    } catch (err: any) {
      setError(err.message);
      console.error('Music search error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleAlbumSearch = async () => {
    if (!query.trim()) return;
    
    setLoading(true);
    setError(null);
    setLastSearchType('albums');
    try {
      const albumResults = await searchAlbums({ query });
      setResults(albumResults);
      console.log('Album results:', albumResults);
    } catch (err: any) {
      setError(err.message);
      console.error('Album search error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleTrendingGames = async () => {
    setLoading(true);
    setError(null);
    setQuery(''); // Clear search since this is trending
    setLastSearchType('trending');
    try {
      const trendingResults = await getTrendingGames({ limit: 20 });
      setResults(trendingResults);
      console.log('Trending game results:', trendingResults);
    } catch (err: any) {
      setError(err.message);
      console.error('Trending games error:', err);
    } finally {
      setLoading(false);
    }
  };

  // Handle Enter key press for different search types
  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      // Default to movie search on Enter
      handleMovieSearch();
    }
  };

  return (
    <div className="p-4 border rounded mt-4">
      <h3 className="text-lg font-bold mb-3">🧪 Test Media APIs</h3>
      
      <div className="mb-4">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search for movies, TV shows, games, or music..."
          className="w-full p-2 border rounded mb-3"
          onKeyPress={handleKeyPress}
        />
        
        <div className="flex gap-2 flex-wrap">
          <button 
            onClick={handleMovieSearch}
            disabled={loading}
            className="px-4 py-2 bg-blue-500 text-white rounded disabled:opacity-50 hover:bg-blue-600 transition-colors"
          >
            🎬 Movies
          </button>
          <button 
            onClick={handleTVSearch}
            disabled={loading}
            className="px-4 py-2 bg-green-500 text-white rounded disabled:opacity-50 hover:bg-green-600 transition-colors"
          >
            📺 TV Shows
          </button>
          <button 
            onClick={handleGameSearch}
            disabled={loading}
            className="px-4 py-2 bg-purple-500 text-white rounded disabled:opacity-50 hover:bg-purple-600 transition-colors"
          >
            🎮 Games
          </button>
          <button 
            onClick={handleMusicSearch}
            disabled={loading}
            className="px-4 py-2 bg-pink-500 text-white rounded disabled:opacity-50 hover:bg-pink-600 transition-colors"
          >
            🎵 Music
          </button>
          <button 
            onClick={handleAlbumSearch}
            disabled={loading}
            className="px-4 py-2 bg-indigo-500 text-white rounded disabled:opacity-50 hover:bg-indigo-600 transition-colors"
          >
            💿 Albums
          </button>
          <button 
            onClick={handleTrendingGames}
            disabled={loading}
            className="px-4 py-2 bg-orange-500 text-white rounded disabled:opacity-50 hover:bg-orange-600 transition-colors"
          >
            🔥 Trending Games
          </button>
        </div>
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-blue-600">
          <div className="animate-spin w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full"></div>
          <span>Searching{lastSearchType && ` ${lastSearchType}`}... ⏳</span>
        </div>
      )}
      
      {error && (
        <div className="p-3 bg-red-100 border border-red-400 text-red-700 rounded mb-4">
          <strong>Error:</strong> {error}
        </div>
      )}
      
      {results.length > 0 && (
        <div className="mt-4">
          <h4 className="font-semibold mb-3">
            Results ({results.length}){lastSearchType && ` - ${lastSearchType}`}:
          </h4>
          <div className="grid gap-3 max-h-96 overflow-y-auto">
            {results.map((item, i) => (
              <div key={i} className="flex items-start gap-3 p-3 border rounded hover:bg-gray-50 transition-colors">
                {item.posterUrl ? (
                  <img 
                    src={item.posterUrl} 
                    alt={item.title}
                    className="w-16 h-24 object-cover rounded flex-shrink-0"
                    onError={(e) => {
                      const target = e.target as HTMLImageElement;
                      target.style.display = 'none';
                    }}
                  />
                ) : (
                  <div className="w-16 h-24 bg-gray-200 rounded flex items-center justify-center flex-shrink-0">
                    <span className="text-2xl">
                      {item.type === 'movie' ? '🎬' : 
                       item.type === 'tv' ? '📺' : 
                       item.type === 'game' ? '🎮' : 
                       item.type === 'music' ? '🎵' : '🎭'}
                    </span>
                  </div>
                )}
                
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <h5 className="font-medium text-gray-900 leading-tight">
                      {item.title}
                    </h5>
                    <span className={`px-2 py-1 text-xs font-medium rounded-full flex-shrink-0 ${
                      item.type === 'movie' ? 'bg-blue-100 text-blue-800' :
                      item.type === 'tv' ? 'bg-green-100 text-green-800' :
                      item.type === 'game' ? 'bg-purple-100 text-purple-800' :
                      item.type === 'music' ? 'bg-pink-100 text-pink-800' :
                      'bg-gray-100 text-gray-800'
                    }`}>
                      {item.type.toUpperCase()}
                    </span>
                  </div>
                  
                  <div className="text-sm text-gray-600 mt-1">
                    {item.releaseYear} 
                    {item.season && ` • Season ${item.season}`}
                    {item.artist && ` • ${item.artist}`}
                  </div>
                  
                  {item.description && (
                    <p className="text-sm text-gray-500 mt-2 line-clamp-2">
                      {item.description}
                    </p>
                  )}
                  
                  <div className="text-xs text-gray-400 mt-2">
                    ID: {item.externalId}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* API Status Indicators */}
      <div className="mt-6 pt-4 border-t">
        <h5 className="text-sm font-medium text-gray-700 mb-2">API Status:</h5>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 bg-green-500 rounded-full"></div>
            <span>🎬 TMDB Movies</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 bg-green-500 rounded-full"></div>
            <span>📺 TMDB TV</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 bg-yellow-500 rounded-full"></div>
            <span>🎮 RAWG Games</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 bg-yellow-500 rounded-full"></div>
            <span>🎵 Spotify Music</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 bg-yellow-500 rounded-full"></div>
            <span>💿 Spotify Albums</span>
          </div>
        </div>
        <p className="text-xs text-gray-500 mt-2">
          Green = Working • Yellow = Testing • Red = Error
        </p>
      </div>
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
    <div className="p-8 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">
          🎬 STACKD Media API Testing
        </h1>
        <div className="flex items-center gap-4">
          {user && <div className="text-gray-600">Welcome {user.username}! 🎉</div>}
          {user === null && <div className="text-gray-600">Setting up your account...</div>}
          <UserButton />
        </div>
      </div>
      
      {/* Only show test component when user is loaded */}
      {user && <MediaTest />}
      
      {/* Environment Variables Reminder */}
      <div className="mt-8 p-4 bg-blue-50 border border-blue-200 rounded">
        <h3 className="font-medium text-blue-900 mb-2">🔑 Environment Variables Required:</h3>
        <ul className="text-sm text-blue-700 space-y-1">
          <li>✅ <code>TMDB_API_KEY</code> - Already configured</li>
          <li>🔄 <code>RAWG_API_KEY</code> - Get from <a href="https://rawg.io/apidocs" target="_blank" rel="noopener" className="underline">rawg.io</a></li>
          <li>🔄 <code>SPOTIFY_CLIENT_ID</code> - Get from <a href="https://developer.spotify.com/dashboard" target="_blank" rel="noopener" className="underline">Spotify Developer Dashboard</a></li>
          <li>🔄 <code>SPOTIFY_CLIENT_SECRET</code> - Get from <a href="https://developer.spotify.com/dashboard" target="_blank" rel="noopener" className="underline">Spotify Developer Dashboard</a></li>
        </ul>
        <p className="text-xs text-blue-600 mt-2">
          Add environment variables in Convex Dashboard → Settings → Environment Variables
        </p>
      </div>

      {/* API Usage Tips */}
      <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded">
        <h3 className="font-medium text-green-900 mb-2">💡 Testing Tips:</h3>
        <ul className="text-sm text-green-700 space-y-1">
          <li>🎬 <strong>Movies:</strong> Try "Inception", "The Matrix", "Avengers"</li>
          <li>📺 <strong>TV Shows:</strong> Try "Breaking Bad", "Game of Thrones", "The Office"</li>
          <li>🎮 <strong>Games:</strong> Try "Cyberpunk 2077", "Elden Ring", "Minecraft"</li>
          <li>🎵 <strong>Music:</strong> Try "Bohemian Rhapsody", "Shape of You", "Billie Jean"</li>
          <li>💿 <strong>Albums:</strong> Try "Abbey Road", "Thriller", "Dark Side of the Moon"</li>
        </ul>
      </div>
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
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-gray-900 mb-4">
              🎬 STACKD Media Testing
            </h1>
            <p className="text-gray-600 mb-6">
              Sign in to test the media APIs
            </p>
            <SignInButton mode="modal">
              <button className="px-6 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600">
                Sign In to Test
              </button>
            </SignInButton>
          </div>
        </div>
      </Unauthenticated>
    </>
  )
}
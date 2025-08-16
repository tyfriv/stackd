'use client'
import { Authenticated, Unauthenticated } from 'convex/react'
import { SignInButton, UserButton } from '@clerk/nextjs'
import { useQuery, useMutation, useAction } from 'convex/react'
import { api } from '../convex/_generated/api'
import { useEffect, useState } from 'react'
import LogForm from '../components/LogForm' // Adjust path as needed

function MediaTest() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastSearchType, setLastSearchType] = useState<string>('');

  // LogForm state
  const [selectedMedia, setSelectedMedia] = useState<any | null>(null);
  const [showLogForm, setShowLogForm] = useState(false);

  // Mutation testing state (for advanced users)
  const [showAdvancedTesting, setShowAdvancedTesting] = useState(false);
  const [mutationLoading, setMutationLoading] = useState<string | null>(null);
  const [mutationResults, setMutationResults] = useState<any[]>([]);
  const [mutationError, setMutationError] = useState<string | null>(null);

  // TMDB Actions
  const searchMovies = useAction(api.media.tmdb.searchMovies);
  const searchTV = useAction(api.media.tmdb.searchTVShows);
  
  // RAWG Actions
  const searchGames = useAction(api.media.rawg.searchGames);
  const getTrendingGames = useAction(api.media.rawg.getTrendingGames);

  // Spotify Actions
  const searchMusic = useAction(api.media.spotify.searchMusic);
  const searchAlbums = useAction(api.media.spotify.searchAlbums);

  // Mutation for caching media
  const getOrCreateMedia = useMutation(api.media.mediaQueries.getOrCreateMediaFromSearch);

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

  // Main user flow: Log This Media
  const handleLogMedia = async (item: any) => {
    try {
      // First, cache the media item in the database
      const cachedMedia = await getOrCreateMedia({
        externalId: item.externalId,
        type: item.type,
        title: item.title,
        releaseYear: item.releaseYear,
        posterUrl: item.posterUrl,
        description: item.description,
        artist: item.artist,
        season: item.season,
      });
      
      console.log('Cached media for logging:', cachedMedia);
      
      // Set the cached media and show the log form
      setSelectedMedia(cachedMedia);
      setShowLogForm(true);
      
    } catch (err: any) {
      setError(`Failed to prepare media for logging: ${err.message}`);
      console.error('Log media error:', err);
    }
  };

  // Advanced testing: Manual cache button (for developers)
  const handleCacheMedia = async (item: any) => {
    setMutationLoading(item.externalId);
    setMutationError(null);
    
    try {
      const cachedMedia = await getOrCreateMedia({
        externalId: item.externalId,
        type: item.type,
        title: item.title,
        releaseYear: item.releaseYear,
        posterUrl: item.posterUrl,
        description: item.description,
        artist: item.artist,
        season: item.season,
      });
      
      console.log('Cached media result:', cachedMedia);
      
      // Add to mutation results
      setMutationResults(prev => {
        const existingIndex = prev.findIndex(m => m._id === cachedMedia._id);
        if (existingIndex >= 0) {
          // Update existing
          const updated = [...prev];
          updated[existingIndex] = cachedMedia;
          return updated;
        } else {
          // Add new
          return [cachedMedia, ...prev];
        }
      });
      
    } catch (err: any) {
      setMutationError(err.message);
      console.error('Cache media error:', err);
    } finally {
      setMutationLoading(null);
    }
  };

  const clearMutationResults = () => {
    setMutationResults([]);
    setMutationError(null);
  };

  const handleLogFormSuccess = () => {
    setShowLogForm(false);
    setSelectedMedia(null);
    // Optionally show success message
    console.log('Log created successfully!');
  };

  const handleLogFormCancel = () => {
    setShowLogForm(false);
    setSelectedMedia(null);
  };

  // Handle Enter key press for different search types
  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      // Default to movie search on Enter
      handleMovieSearch();
    }
  };

  return (
    <div className="space-y-6">
      {/* Main Search Interface */}
      <div className="p-4 border rounded">
        <h3 className="text-lg font-bold mb-3">🎬 Search & Log Media</h3>
        
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
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                          item.type === 'movie' ? 'bg-blue-100 text-blue-800' :
                          item.type === 'tv' ? 'bg-green-100 text-green-800' :
                          item.type === 'game' ? 'bg-purple-100 text-purple-800' :
                          item.type === 'music' ? 'bg-pink-100 text-pink-800' :
                          'bg-gray-100 text-gray-800'
                        }`}>
                          {item.type.toUpperCase()}
                        </span>
                        
                        {/* Main User Action: Log This */}
                        <button
                          onClick={() => handleLogMedia(item)}
                          className="px-3 py-1.5 bg-gradient-to-r from-green-500 to-blue-500 text-white rounded-lg hover:from-green-600 hover:to-blue-600 transition-all font-medium shadow-sm"
                        >
                          📝 Log This
                        </button>
                        
                        {/* Advanced Testing: Cache Button (only show if advanced mode is on) */}
                        {showAdvancedTesting && (
                          <button
                            onClick={() => handleCacheMedia(item)}
                            disabled={mutationLoading === item.externalId}
                            className="px-2 py-1 text-xs bg-indigo-500 text-white rounded hover:bg-indigo-600 disabled:opacity-50 transition-colors"
                          >
                            {mutationLoading === item.externalId ? (
                              <div className="flex items-center gap-1">
                                <div className="w-3 h-3 border border-white border-t-transparent rounded-full animate-spin"></div>
                                <span>Cache</span>
                              </div>
                            ) : (
                              '💾 Cache'
                            )}
                          </button>
                        )}
                      </div>
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
      </div>

      {/* LogForm Modal/Section */}
      {showLogForm && selectedMedia && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <LogForm
              media={selectedMedia}
              onSuccess={handleLogFormSuccess}
              onCancel={handleLogFormCancel}
            />
          </div>
        </div>
      )}

      {/* Advanced Testing Toggle */}
      <div className="p-4 bg-gray-50 border border-gray-200 rounded">
        <div className="flex items-center justify-between mb-2">
          <h4 className="font-medium text-gray-900">🔧 Developer Testing Mode</h4>
          <button
            onClick={() => setShowAdvancedTesting(!showAdvancedTesting)}
            className={`px-3 py-1 text-sm rounded transition-colors ${
              showAdvancedTesting 
                ? 'bg-purple-500 text-white' 
                : 'bg-gray-300 text-gray-700 hover:bg-gray-400'
            }`}
          >
            {showAdvancedTesting ? 'Disable' : 'Enable'}
          </button>
        </div>
        <p className="text-sm text-gray-600">
          Enable this to see advanced mutation testing features and manual cache buttons.
        </p>
      </div>

      {/* Advanced Mutation Results Section (only show if enabled) */}
      {showAdvancedTesting && (mutationResults.length > 0 || mutationError) && (
        <div className="p-4 bg-indigo-50 border border-indigo-200 rounded">
          <div className="flex items-center justify-between mb-3">
            <h4 className="font-semibold text-indigo-900">
              💾 Cached Media Items ({mutationResults.length})
            </h4>
            <button
              onClick={clearMutationResults}
              className="px-3 py-1 text-xs bg-indigo-100 text-indigo-700 rounded hover:bg-indigo-200 transition-colors"
            >
              Clear
            </button>
          </div>
          
          {mutationError && (
            <div className="p-3 bg-red-100 border border-red-400 text-red-700 rounded mb-3">
              <strong>Mutation Error:</strong> {mutationError}
            </div>
          )}
          
          <div className="space-y-3 max-h-64 overflow-y-auto">
            {mutationResults.map((item) => (
              <div key={item._id} className="flex items-start gap-3 p-3 bg-white border rounded">
                {item.posterUrl ? (
                  <img 
                    src={item.posterUrl} 
                    alt={item.title}
                    className="w-12 h-16 object-cover rounded flex-shrink-0"
                  />
                ) : (
                  <div className="w-12 h-16 bg-gray-200 rounded flex items-center justify-center flex-shrink-0">
                    <span className="text-lg">
                      {item.type === 'movie' ? '🎬' : 
                       item.type === 'tv' ? '📺' : 
                       item.type === 'game' ? '🎮' : 
                       item.type === 'music' ? '🎵' : '🎭'}
                    </span>
                  </div>
                )}
                
                <div className="flex-1 min-w-0">
                  <h5 className="font-medium text-gray-900 leading-tight">
                    {item.title}
                  </h5>
                  <div className="text-sm text-gray-600">
                    {item.releaseYear}
                    {item.artist && ` • ${item.artist}`}
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    <span className="bg-green-100 text-green-800 px-1 py-0.5 rounded">
                      Convex ID: {item._id}
                    </span>
                  </div>
                  <div className="text-xs text-gray-400">
                    External ID: {item.externalId}
                  </div>
                </div>
              </div>
            ))}
          </div>
          
          <p className="text-xs text-indigo-600 mt-3">
            ✅ These items are now cached in your Convex database and can be used for logging!
          </p>
        </div>
      )}

      {/* API Status Indicators */}
      <div className="p-4 bg-white border rounded">
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
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
            <span>💾 Cache Mutation</span>
          </div>
        </div>
        <p className="text-xs text-gray-500 mt-2">
          Green = Working • Yellow = Testing • Blue = New Feature • Red = Error
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
          🎬 STACKD Media Testing
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

      {/* Updated Usage Tips */}
      <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded">
        <h3 className="font-medium text-green-900 mb-2">🎯 How to Test:</h3>
        <ol className="text-sm text-green-700 space-y-1 list-decimal list-inside">
          <li>Search for any media using the buttons above</li>
          <li>Click the <strong>"📝 Log This"</strong> button on any result</li>
          <li>The LogForm will open in a modal - fill it out and save!</li>
          <li>The media is automatically cached in your database during this process</li>
          <li><em>Optional:</em> Enable Developer Mode to see advanced caching features</li>
        </ol>
      </div>

      {/* Testing Suggestions */}
      <div className="mt-4 p-4 bg-yellow-50 border border-yellow-200 rounded">
        <h3 className="font-medium text-yellow-900 mb-2">💡 Test These Popular Items:</h3>
        <ul className="text-sm text-yellow-700 space-y-1">
          <li>🎬 <strong>Movies:</strong> "Inception", "The Matrix", "Avengers"</li>
          <li>📺 <strong>TV Shows:</strong> "Breaking Bad", "Game of Thrones", "The Office"</li>
          <li>🎮 <strong>Games:</strong> "Cyberpunk 2077", "Elden Ring", "Minecraft"</li>
          <li>🎵 <strong>Music:</strong> "Bohemian Rhapsody", "Shape of You", "Billie Jean"</li>
          <li>💿 <strong>Albums:</strong> "Abbey Road", "Thriller", "Dark Side of the Moon"</li>
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
              Sign in to test the media APIs and logging
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
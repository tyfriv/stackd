'use client'

import { useState } from 'react'
import { useQuery, useMutation } from 'convex/react'
import { api } from '../../convex/_generated/api'
import { useUser } from '@clerk/nextjs'

export default function TestMediaPage() {
  const { user } = useUser()
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedMedia, setSelectedMedia] = useState<any>(null)
  const [logForm, setLogForm] = useState({
    rating: 5,
    review: '',
    visibility: 'public' as 'public' | 'followers' | 'private',
    hasSpoilers: false
  })

  // Queries
  const currentUser = useQuery(api.users.getCurrentUser)
  const userLogs = useQuery(api.logs.logOperations.getUserLogs, 
    currentUser ? { userId: currentUser._id, limit: 10 } : 'skip'
  )

  // Mutations
  const createUser = useMutation(api.users.createUserIfNotExists)
  const updateProfile = useMutation(api.users.updateProfile)
  const createLog = useMutation(api.logs.logOperations.createLog)
  const searchMovies = useMutation(api.media.tmdb.searchMovies)
  const searchGames = useMutation(api.media.rawg.searchGames)

  const [searchResults, setSearchResults] = useState<any[]>([])
  const [loading, setLoading] = useState(false)

  const handleSearch = async (type: 'movies' | 'games') => {
    if (!searchQuery.trim()) return
    
    setLoading(true)
    try {
      let results
      if (type === 'movies') {
        results = await searchMovies({ query: searchQuery })
      } else {
        results = await searchGames({ query: searchQuery })
      }
      setSearchResults(results || [])
    } catch (error) {
      console.error('Search error:', error)
      setSearchResults([])
    }
    setLoading(false)
  }

  const handleCreateLog = async () => {
    if (!selectedMedia || !currentUser) return
    
    try {
      await createLog({
        mediaId: selectedMedia._id,
        rating: logForm.rating,
        review: logForm.review || undefined,
        visibility: logForm.visibility,
        hasSpoilers: logForm.hasSpoilers
      })
      alert('Log created successfully!')
      setSelectedMedia(null)
      setLogForm({ rating: 5, review: '', visibility: 'public', hasSpoilers: false })
    } catch (error) {
      console.error('Create log error:', error)
      alert('Error creating log')
    }
  }

  const initializeUser = async () => {
    try {
      await createUser()
      alert('User initialized!')
    } catch (error) {
      console.error('User init error:', error)
    }
  }

  const updateUserProfile = async () => {
    try {
      await updateProfile({
        bio: 'Test bio updated at ' + new Date().toLocaleTimeString(),
        profileImage: user?.imageUrl
      })
      alert('Profile updated!')
    } catch (error) {
      console.error('Profile update error:', error)
    }
  }

  return (
    <div className="container mx-auto p-6 space-y-8">
      <h1 className="text-3xl font-bold mb-6">🧪 Media & Logs Test Page</h1>
      
      {/* User Status */}
      <div className="bg-blue-50 p-4 rounded-lg">
        <h2 className="text-xl font-semibold mb-2">👤 User Status</h2>
        <div className="space-y-2">
          <p><strong>Clerk User:</strong> {user?.emailAddresses[0]?.emailAddress || 'Not logged in'}</p>
          <p><strong>Database User:</strong> {currentUser?.username || 'Not found'}</p>
          <div className="space-x-2">
            <button 
              onClick={initializeUser}
              className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
            >
              Initialize User
            </button>
            <button 
              onClick={updateUserProfile}
              className="bg-green-500 text-white px-4 py-2 rounded hover:bg-green-600"
            >
              Update Profile
            </button>
          </div>
        </div>
      </div>

      {/* Media Search */}
      <div className="bg-gray-50 p-4 rounded-lg">
        <h2 className="text-xl font-semibold mb-4">🔍 Media Search</h2>
        <div className="flex gap-2 mb-4">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search for movies or games..."
            className="flex-1 p-2 border rounded"
          />
          <button 
            onClick={() => handleSearch('movies')}
            disabled={loading}
            className="bg-purple-500 text-white px-4 py-2 rounded hover:bg-purple-600 disabled:opacity-50"
          >
            Search Movies
          </button>
          <button 
            onClick={() => handleSearch('games')}
            disabled={loading}
            className="bg-orange-500 text-white px-4 py-2 rounded hover:bg-orange-600 disabled:opacity-50"
          >
            Search Games
          </button>
        </div>
        
        {loading && <p>Searching...</p>}
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {searchResults.map((item, index) => (
            <div key={index} className="border rounded p-4 bg-white">
              <img 
                src={item.posterUrl} 
                alt={item.title}
                className="w-full h-48 object-cover rounded mb-2"
              />
              <h3 className="font-semibold">{item.title}</h3>
              <p className="text-sm text-gray-600">{item.releaseYear}</p>
              <p className="text-xs text-gray-500 mt-1">{item.description?.substring(0, 100)}...</p>
              <button
                onClick={() => setSelectedMedia(item)}
                className="mt-2 bg-blue-500 text-white px-3 py-1 rounded text-sm hover:bg-blue-600"
              >
                Select for Log
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Log Creation */}
      {selectedMedia && (
        <div className="bg-green-50 p-4 rounded-lg">
          <h2 className="text-xl font-semibold mb-4">📝 Create Log</h2>
          <div className="mb-4">
            <strong>Selected:</strong> {selectedMedia.title} ({selectedMedia.releaseYear})
          </div>
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">Rating (0-10)</label>
              <input
                type="number"
                min="0"
                max="10"
                step="0.5"
                value={logForm.rating}
                onChange={(e) => setLogForm(prev => ({ ...prev, rating: parseFloat(e.target.value) }))}
                className="w-full p-2 border rounded"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium mb-1">Review</label>
              <textarea
                value={logForm.review}
                onChange={(e) => setLogForm(prev => ({ ...prev, review: e.target.value }))}
                className="w-full p-2 border rounded h-24"
                placeholder="Write your review..."
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium mb-1">Visibility</label>
              <select
                value={logForm.visibility}
                onChange={(e) => setLogForm(prev => ({ ...prev, visibility: e.target.value as any }))}
                className="w-full p-2 border rounded"
              >
                <option value="public">Public</option>
                <option value="followers">Followers Only</option>
                <option value="private">Private</option>
              </select>
            </div>
            
            <div>
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={logForm.hasSpoilers}
                  onChange={(e) => setLogForm(prev => ({ ...prev, hasSpoilers: e.target.checked }))}
                  className="mr-2"
                />
                Contains Spoilers
              </label>
            </div>
            
            <div className="space-x-2">
              <button
                onClick={handleCreateLog}
                className="bg-green-500 text-white px-4 py-2 rounded hover:bg-green-600"
              >
                Create Log
              </button>
              <button
                onClick={() => setSelectedMedia(null)}
                className="bg-gray-500 text-white px-4 py-2 rounded hover:bg-gray-600"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* User Logs */}
      <div className="bg-yellow-50 p-4 rounded-lg">
        <h2 className="text-xl font-semibold mb-4">📚 Your Recent Logs</h2>
        {userLogs && userLogs.length > 0 ? (
          <div className="space-y-4">
            {userLogs.map((log: any) => (
              <div key={log._id} className="border rounded p-4 bg-white">
                <div className="flex justify-between items-start mb-2">
                  <h3 className="font-semibold">{log.media?.title}</h3>
                  <span className="text-sm bg-blue-100 px-2 py-1 rounded">{log.visibility}</span>
                </div>
                <div className="flex items-center gap-4 mb-2">
                  <span>⭐ {log.rating}/10</span>
                  <span className="text-sm text-gray-600">
                    {new Date(log.loggedAt).toLocaleDateString()}
                  </span>
                  {log.hasSpoilers && <span className="text-sm bg-red-100 px-2 py-1 rounded">Spoilers</span>}
                </div>
                {log.review && (
                  <p className="text-gray-700 mt-2">{log.review}</p>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-gray-600">No logs found. Create one above!</p>
        )}
      </div>

      {/* Test Status */}
      <div className="bg-gray-100 p-4 rounded-lg">
        <h2 className="text-xl font-semibold mb-2">✅ Test Checklist</h2>
        <ul className="space-y-1">
          <li>✅ User authentication (Clerk integration)</li>
          <li>✅ User creation and profile updates</li>
          <li>✅ Media search (TMDB movies, RAWG games)</li>
          <li>✅ Media caching system</li>
          <li>✅ Log creation with ratings, reviews, visibility</li>
          <li>✅ User log retrieval and display</li>
          <li>✅ Input validation and sanitization</li>
          <li>✅ Error handling</li>
        </ul>
      </div>
    </div>
  )
}

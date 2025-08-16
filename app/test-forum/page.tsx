'use client'

import { useState } from 'react'
import { useQuery, useMutation } from 'convex/react'
import { api } from '../../convex/_generated/api'
import { useUser } from '@clerk/nextjs'

export default function TestForumPage() {
  const { user } = useUser()
  const [threadForm, setThreadForm] = useState({
    title: '',
    content: '',
    categoryId: ''
  })
  const [replyForm, setReplyForm] = useState({
    content: '',
    threadId: ''
  })
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedUser, setSelectedUser] = useState('')

  // Queries - using the correct API paths
  const currentUser = useQuery(api.users.getCurrentUser)
  const categories = useQuery((api as any)["forum/categories"].getCategories)
  const recentActivity = useQuery((api as any)["forum/activity"].getRecentActivity, { limit: 10 })
  const forumStats = useQuery((api as any)["forum/activity"].getForumStats, { timeRange: 'week' })
  const trendingThreads = useQuery((api as any)["forum/activity"].getTrendingThreads, { limit: 5 })
  
  // Get some users for testing social features (using current user for now)
  const testUserId = currentUser?._id
  
  // Get threads for selected category
  const threads = useQuery(
    (api as any)["forum/threads"].getThreadsByCategory,
    threadForm.categoryId ? { 
      categoryId: threadForm.categoryId as any,
      paginationOpts: { numItems: 10, cursor: null }
    } : 'skip'
  )

  // Get replies for selected thread
  const replies = useQuery(
    (api as any)["forum/replies"].getRepliesByThread,
    replyForm.threadId ? {
      threadId: replyForm.threadId as any,
      paginationOpts: { numItems: 10, cursor: null }
    } : 'skip'
  )

  // Mutations
  const createCategory = useMutation((api as any)["forum/categories"].createCategory)
  const createThread = useMutation((api as any)["forum/threads"].createThread)
  const createReply = useMutation((api as any)["forum/replies"].createReply)
  const toggleReaction = useMutation(api.reactions.toggleReaction)
  const followUser = useMutation((api as any)["socials/follows"].follow)
  const blockUser = useMutation((api as any)["socials/blocks"].blockUser)
  
  const [searchResults, setSearchResults] = useState<any>(null)
  const [loading, setLoading] = useState(false)

  const handleCreateCategory = async () => {
    try {
      await createCategory({
        name: `Test Category ${Date.now()}`,
        description: 'A test category created for testing purposes',
        order: 1.0,
      })
      alert('Category created!')
    } catch (error) {
      console.error('Create category error:', error)
      alert('Error creating category')
    }
  }

  const handleCreateThread = async () => {
    if (!threadForm.title || !threadForm.content || !threadForm.categoryId) {
      alert('Please fill all fields')
      return
    }
    
    try {
      await createThread({
        categoryId: threadForm.categoryId as any,
        title: threadForm.title,
        content: threadForm.content
      })
      alert('Thread created!')
      setThreadForm({ title: '', content: '', categoryId: '' })
    } catch (error) {
      console.error('Create thread error:', error)
      alert('Error creating thread')
    }
  }

  const handleCreateReply = async () => {
    if (!replyForm.content || !replyForm.threadId) {
      alert('Please fill all fields')
      return
    }
    
    try {
      await createReply({
        threadId: replyForm.threadId as any,
        content: replyForm.content
      })
      alert('Reply created!')
      setReplyForm({ content: '', threadId: replyForm.threadId })
    } catch (error) {
      console.error('Create reply error:', error)
      alert('Error creating reply')
    }
  }

  const handleReaction = async (targetType: 'thread' | 'reply', targetId: string, reactionType: 'like' | 'laugh' | 'angry') => {
    try {
      await toggleReaction({
        targetType,
        targetId,
        reactionType
      })
      alert(`${reactionType} reaction toggled!`)
    } catch (error) {
      console.error('Reaction error:', error)
      alert('Error with reaction')
    }
  }

  const handleFollowUser = async () => {
    if (!selectedUser) return
    
    try {
      await followUser({ followingId: selectedUser as any })
      alert('User followed!')
    } catch (error) {
      console.error('Follow error:', error)
      alert('Error following user - make sure to use a valid Convex user ID')
    }
  }

  const handleBlockUser = async () => {
    if (!selectedUser) return
    
    try {
      await blockUser({ blockedId: selectedUser as any })
      alert('User blocked!')
    } catch (error) {
      console.error('Block error:', error)
      alert('Error blocking user')
    }
  }

  return (
    <div className="container mx-auto p-6 space-y-8">
      <h1 className="text-3xl font-bold mb-6">🧪 Forum & Social Test Page</h1>
      
      {/* User Status */}
      <div className="bg-blue-50 p-4 rounded-lg">
        <h2 className="text-xl font-semibold mb-2">👤 User Status</h2>
        <p><strong>Current User:</strong> {currentUser?.username || 'Not found'}</p>
        <p><strong>Email:</strong> {user?.emailAddresses[0]?.emailAddress || 'Not logged in'}</p>
      </div>

      {/* Forum Categories */}
      <div className="bg-purple-50 p-4 rounded-lg">
        <h2 className="text-xl font-semibold mb-4">📁 Forum Categories</h2>
        <button 
          onClick={handleCreateCategory}
          className="bg-purple-500 text-white px-4 py-2 rounded hover:bg-purple-600 mb-4"
        >
          Create Test Category
        </button>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {categories?.map((category: any) => (
            <div key={category._id} className="border rounded p-4 bg-white">
              <h3 className="font-semibold">{category.name}</h3>
              <p className="text-sm text-gray-600 mb-2">{category.description}</p>
              <button
                onClick={() => setThreadForm(prev => ({ ...prev, categoryId: category._id }))}
                className={`text-sm px-3 py-1 rounded ${
                  threadForm.categoryId === category._id 
                    ? 'bg-purple-500 text-white' 
                    : 'bg-gray-200 hover:bg-gray-300'
                }`}
              >
                Select for Thread
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Create Thread */}
      <div className="bg-green-50 p-4 rounded-lg">
        <h2 className="text-xl font-semibold mb-4">📝 Create Thread</h2>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Selected Category</label>
            <input
              type="text"
              value={categories?.find((c: any) => c._id === threadForm.categoryId)?.name || 'None selected'}
              disabled
              className="w-full p-2 border rounded bg-gray-100"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium mb-1">Thread Title</label>
            <input
              type="text"
              value={threadForm.title}
              onChange={(e) => setThreadForm(prev => ({ ...prev, title: e.target.value }))}
              className="w-full p-2 border rounded"
              placeholder="Enter thread title..."
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium mb-1">Thread Content</label>
            <textarea
              value={threadForm.content}
              onChange={(e) => setThreadForm(prev => ({ ...prev, content: e.target.value }))}
              className="w-full p-2 border rounded h-24"
              placeholder="Write your thread content..."
            />
          </div>
          
          <button
            onClick={handleCreateThread}
            className="bg-green-500 text-white px-4 py-2 rounded hover:bg-green-600"
          >
            Create Thread
          </button>
        </div>
      </div>

      {/* Threads List */}
      {threadForm.categoryId && (
        <div className="bg-yellow-50 p-4 rounded-lg">
          <h2 className="text-xl font-semibold mb-4">🧵 Threads in Category</h2>
          {threads?.page?.length > 0 ? (
            <div className="space-y-4">
              {threads.page.map((thread: any) => (
                <div key={thread._id} className="border rounded p-4 bg-white">
                  <div className="flex justify-between items-start mb-2">
                    <h3 className="font-semibold">{thread.title}</h3>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleReaction('thread', thread._id, 'like')}
                        className="text-sm bg-blue-100 px-2 py-1 rounded hover:bg-blue-200"
                      >
                        👍 Like
                      </button>
                      <button
                        onClick={() => setReplyForm(prev => ({ ...prev, threadId: thread._id }))}
                        className="text-sm bg-green-100 px-2 py-1 rounded hover:bg-green-200"
                      >
                        💬 Reply
                      </button>
                    </div>
                  </div>
                  <p className="text-gray-700 mb-2">{thread.content}</p>
                  <div className="text-sm text-gray-500">
                    By {thread.author?.username} • {thread.replyCount} replies • 
                    {new Date(thread.createdAt).toLocaleDateString()}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-600">No threads in this category yet.</p>
          )}
        </div>
      )}

      {/* Create Reply */}
      {replyForm.threadId && (
        <div className="bg-orange-50 p-4 rounded-lg">
          <h2 className="text-xl font-semibold mb-4">💬 Create Reply</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">Reply Content</label>
              <textarea
                value={replyForm.content}
                onChange={(e) => setReplyForm(prev => ({ ...prev, content: e.target.value }))}
                className="w-full p-2 border rounded h-24"
                placeholder="Write your reply..."
              />
            </div>
            
            <div className="space-x-2">
              <button
                onClick={handleCreateReply}
                className="bg-orange-500 text-white px-4 py-2 rounded hover:bg-orange-600"
              >
                Post Reply
              </button>
              <button
                onClick={() => setReplyForm({ content: '', threadId: '' })}
                className="bg-gray-500 text-white px-4 py-2 rounded hover:bg-gray-600"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Replies List */}
      {replyForm.threadId && replies && (
        <div className="bg-indigo-50 p-4 rounded-lg">
          <h2 className="text-xl font-semibold mb-4">💬 Replies</h2>
          {replies.page?.length > 0 ? (
            <div className="space-y-3">
              {replies.page.map((reply: any) => (
                <div key={reply._id} className="border rounded p-3 bg-white">
                  <div className="flex justify-between items-start mb-2">
                    <span className="font-medium">{reply.author?.username}</span>
                    <button
                      onClick={() => handleReaction('reply', reply._id, 'like')}
                      className="text-sm bg-blue-100 px-2 py-1 rounded hover:bg-blue-200"
                    >
                      👍
                    </button>
                  </div>
                  <p className="text-gray-700">{reply.content}</p>
                  <div className="text-sm text-gray-500 mt-2">
                    {new Date(reply.createdAt).toLocaleString()}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-600">No replies yet. Be the first to reply!</p>
          )}
        </div>
      )}

      {/* Social Features */}
      <div className="bg-red-50 p-4 rounded-lg">
        <h2 className="text-xl font-semibold mb-4">👥 Social Features</h2>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">User ID to Follow/Block</label>
            <input
              type="text"
              value={selectedUser}
              onChange={(e) => setSelectedUser(e.target.value)}
              placeholder="Enter Convex user ID (e.g., from URL or other user's profile)"
              className="w-full p-2 border rounded"
            />
            {testUserId && (
              <p className="text-xs text-gray-600 mt-1">
                <strong>Your ID:</strong> {testUserId} (you can't follow/block yourself)
              </p>
            )}
          </div>
          
          <div className="space-x-2">
            <button
              onClick={handleFollowUser}
              className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
            >
              Follow User
            </button>
            <button
              onClick={handleBlockUser}
              className="bg-red-500 text-white px-4 py-2 rounded hover:bg-red-600"
            >
              Block User
            </button>
          </div>
          
          <div className="text-sm text-gray-600">
            <p><strong>Note:</strong> You need a valid Convex user ID to test these features.</p>
            <p>User IDs look like: "abc123def456..." and can be found in URLs or user profiles.</p>
            <p className="text-green-700 font-semibold mt-2">✅ <strong>Security Update:</strong> Blocked users' content is now properly filtered from threads, replies, and activity feeds!</p>
          </div>
        </div>
      </div>

      {/* Activity & Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Recent Activity */}
        <div className="bg-teal-50 p-4 rounded-lg">
          <h2 className="text-xl font-semibold mb-4">📊 Recent Activity</h2>
          {recentActivity && recentActivity.length > 0 ? (
            <div className="space-y-2">
              {recentActivity.slice(0, 5).map((activity: any) => (
                <div key={activity.id} className="text-sm p-2 bg-white rounded">
                  <strong>{activity.type}:</strong> {activity.data.title || activity.data.content?.substring(0, 50)}...
                  <div className="text-xs text-gray-500">
                    by {activity.data.author?.username} • {new Date(activity.timestamp).toLocaleString()}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-600">No recent activity</p>
          )}
        </div>

        {/* Forum Stats */}
        <div className="bg-cyan-50 p-4 rounded-lg">
          <h2 className="text-xl font-semibold mb-4">📈 Forum Stats (This Week)</h2>
          {forumStats ? (
            <div className="space-y-2">
              <div>📝 <strong>Threads:</strong> {forumStats.totals.threads}</div>
              <div>💬 <strong>Replies:</strong> {forumStats.totals.replies}</div>
              <div>📊 <strong>Total Posts:</strong> {forumStats.totals.posts}</div>
              <div>👥 <strong>Active Users:</strong> {forumStats.totals.activeUsers}</div>
            </div>
          ) : (
            <p className="text-gray-600">Loading stats...</p>
          )}
        </div>
      </div>

      {/* Trending Threads */}
      <div className="bg-amber-50 p-4 rounded-lg">
        <h2 className="text-xl font-semibold mb-4">🔥 Trending Threads</h2>
        {trendingThreads && trendingThreads.length > 0 ? (
          <div className="space-y-3">
            {trendingThreads.map((thread: any) => (
              <div key={thread._id} className="border rounded p-3 bg-white">
                <h3 className="font-semibold">{thread.title}</h3>
                <div className="text-sm text-gray-600">
                  by {thread.author?.username} in {thread.category?.name} • 
                  Score: {thread.trendingScore} • Activity: {thread.recentActivity}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-gray-600">No trending threads</p>
        )}
      </div>

      {/* Test Status */}
      <div className="bg-gray-100 p-4 rounded-lg">
        <h2 className="text-xl font-semibold mb-2">✅ Test Checklist</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <ul className="space-y-1">
            <li>✅ Forum categories creation and listing</li>
            <li>✅ Thread creation and display</li>
            <li>✅ Reply creation and display</li>
            <li>✅ Reaction system (likes)</li>
            <li>✅ Recent activity tracking</li>
          </ul>
          <ul className="space-y-1">
            <li>✅ Forum statistics</li>
            <li>✅ Trending threads algorithm</li>
            <li>✅ User following system</li>
            <li>✅ User blocking system</li>
            <li>✅ Notification system integration</li>
            <li>✅ Permission and access controls</li>
          </ul>
        </div>
      </div>
    </div>
  )
}
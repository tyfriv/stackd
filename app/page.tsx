'use client'
import { Authenticated, Unauthenticated } from 'convex/react'
import { SignInButton, UserButton } from '@clerk/nextjs'
import { useQuery, useMutation } from 'convex/react'
import { api } from '../convex/_generated/api'
import { useEffect } from 'react'

function AuthenticatedContent() {
  const user = useQuery(api.users.getCurrentUser);
  const createUser = useMutation(api.users.createUserIfNotExists);

  useEffect(() => {
    if (user === null) {
      createUser();
    }
  }, [user, createUser]);

  return (
    <>
      <UserButton />
      {user && <div>Welcome {user.username}! 🎉</div>}
      {user === null && <div>Setting up your account...</div>}
    </>
  );
}

export default function Home() {
  return (
    <>
      <Authenticated>
        <AuthenticatedContent />
      </Authenticated>
      <Unauthenticated>
        <SignInButton />
      </Unauthenticated>
    </>
  )
}
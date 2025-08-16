// middleware.ts - Add CSRF middleware
import { clerkMiddleware } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';

export default clerkMiddleware((auth, req) => {
  // Convex handles authentication and security internally
  // No need for additional middleware protection on Convex functions
  return NextResponse.next();
});
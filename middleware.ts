// middleware.ts - Enhanced security middleware
import { clerkMiddleware } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';

export default clerkMiddleware((auth, req) => {
  // Convex handles authentication and security internally
  const response = NextResponse.next();
  
  // SECURITY HEADERS - Commented out for development
  // Uncomment for production deployment, but test thoroughly first
  // CSP headers can break hot reloading and development tools
  
  /* 
  // Basic security headers (safe for most environments)
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  
  // Content Security Policy (CAREFUL - can break development)
  // Only enable in production and adjust domains as needed
  response.headers.set(
    'Content-Security-Policy',
    "default-src 'self'; " +
    "script-src 'self' 'unsafe-eval' 'unsafe-inline' https://clerk.accounts.dev; " +
    "style-src 'self' 'unsafe-inline'; " + 
    "img-src 'self' data: https:; " +
    "connect-src 'self' https://api.convex.dev https://clerk.accounts.dev;"
  );
  */
  
  return response;
});
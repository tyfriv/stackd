const clerkFrontendApiUrl = process.env.CLERK_FRONTEND_API_URL;
if (!clerkFrontendApiUrl) {
  throw new Error("CLERK_FRONTEND_API_URL environment variable is required. Please add it to your Convex environment variables.");
}

// SECURITY FIX: Validate the domain format
if (!clerkFrontendApiUrl.startsWith('https://') || !clerkFrontendApiUrl.includes('.clerk.accounts.dev')) {
  throw new Error("Invalid CLERK_FRONTEND_API_URL format. Must be a valid Clerk domain.");
}

export default {
  providers: [
    {
      domain: clerkFrontendApiUrl,
      applicationID: 'convex',
    },
  ],
}
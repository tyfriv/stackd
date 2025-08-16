const clerkFrontendApiUrl = process.env.CLERK_FRONTEND_API_URL;
if (!clerkFrontendApiUrl) {
  throw new Error("CLERK_FRONTEND_API_URL environment variable is required. Please add it to your Convex environment variables.");
}

export default {
  providers: [
    {
      domain: clerkFrontendApiUrl,
      applicationID: 'convex',
    },
  ],
}
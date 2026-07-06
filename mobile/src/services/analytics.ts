import PostHog from 'posthog-react-native';
import type { PostHogEventProperties } from '@posthog/core';

const apiKey = process.env.EXPO_PUBLIC_POSTHOG_API_KEY;
const host = process.env.EXPO_PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com';
const isConfigured = Boolean(apiKey && apiKey !== 'phc_your_project_token_here');

if (!isConfigured) {
  console.warn(
    'PostHog API key not configured. Analytics will be disabled. ' +
      'Set EXPO_PUBLIC_POSTHOG_API_KEY in your .env file to enable analytics.'
  );
}

export const posthog = new PostHog(apiKey || 'placeholder_key', {
  host,
  disabled: !isConfigured,
  captureAppLifecycleEvents: true,
  enableSessionReplay: true,
  flushAt: 20,
  flushInterval: 10000,
  maxBatchSize: 100,
  maxQueueSize: 1000,
  preloadFeatureFlags: true,
  sendFeatureFlagEvent: true,
  featureFlagsRequestTimeoutMs: 10000,
  requestTimeout: 10000,
  fetchRetryCount: 3,
  fetchRetryDelay: 3000,
});

// __DEV__ is true only for a JS bundle served by Metro (Expo Go / dev client / `npm start`),
// and false for any release bundle (preview and production EAS builds alike) — so this tags
// every event, including autocaptured ones, without needing a separate build-time env var.
export const analyticsEnvironment = __DEV__ ? 'development' : 'production';
posthog.register({ environment: analyticsEnvironment });

export function track(event: string, properties?: PostHogEventProperties) {
  posthog.capture(event, properties);
}

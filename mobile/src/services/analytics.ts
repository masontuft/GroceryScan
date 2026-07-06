import PostHog from 'posthog-react-native';
import Constants, { ExecutionEnvironment } from 'expo-constants';
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

// Expo Go (Constants.executionEnvironment === 'storeClient') never has the
// posthog-react-native-session-replay native module linked. The SDK's own
// session-replay startup code calls `OptionalReactNativePlugin.isEnabled()`
// without checking it's defined first, so with enableSessionReplay left on
// under Expo Go that throws on `undefined` and crashes the app. Only a custom
// dev client or a standalone/EAS build actually has the native module built in.
const isExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

export const posthog = new PostHog(apiKey || 'placeholder_key', {
  host,
  disabled: !isConfigured,
  captureAppLifecycleEvents: true,
  enableSessionReplay: !isExpoGo,
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

// SDK-internal debug logging (batching, flushes, network requests) — only in dev,
// where it's useful; would be noisy/wasteful in a shipped build.
posthog.debug(__DEV__);

export function track(event: string, properties?: PostHogEventProperties) {
  // Printed immediately (not batched like the network send, which waits for
  // flushAt/flushInterval) so it shows up in the Metro terminal right when it fires.
  if (__DEV__) console.log(`[PostHog] ${event}`, properties ?? {});
  posthog.capture(event, properties);
}

// For unexpected failures (network/parse/permission errors) that would otherwise be
// silently swallowed — not for expected business outcomes like "product not found",
// which are already covered by regular track() calls (e.g. barcode_scanned found:false).
export function trackError(context: string, error: unknown, properties?: PostHogEventProperties) {
  if (__DEV__) console.warn(`[PostHog] exception: ${context}`, error, properties ?? {});
  posthog.captureException(error, { context, ...properties });
}

# Manual EAS Release Automation Plan

## 1. Overview

GroceryScan currently has no release automation and no CI at all (`.github/workflows/` doesn't exist). This plan designs a **manually triggered** release flow — a script you run from your terminal when you decide a build is ready, not something wired to every push or PR.

The flow, end to end:

1. You run one command.
2. It builds Android + iOS via `eas build --platform all`.
3. It submits the latest finished build of each platform via `eas submit` — Android to Google Play, iOS to TestFlight.
4. It runs fully non-interactively, after a one-time credential setup.

### Assumptions

- Interactive iOS credential setup (`eas credentials`) has been run once already, so EAS has a valid distribution certificate + provisioning profile on file.
- A Google Play Console app entry and an App Store Connect app entry already exist for `com.masontuft.groceryscan`.
- You have an active Apple Developer Program membership and Google Play Console account with permissions on this app.
- Scope for v1 is **TestFlight**, not a full App Store review submission — App Store release is a separate, later manual step you'd trigger yourself in App Store Connect once you're ready to go public.

## 2. EAS Configuration Requirements

### Current state (verified in [mobile/eas.json](../mobile/eas.json))

```json
{
  "cli": {
    "version": ">= 13.0.0",
    "appVersionSource": "remote"
  },
  "build": {
    "development": { "...": "..." },
    "preview": { "...": "..." },
    "production": {
      "autoIncrement": true
    }
  }
}
```

- `build.production` already exists with `autoIncrement: true` — EAS bumps the build number on every production build automatically.
- `appVersionSource: "remote"` — EAS, not your local `app.json`, is the source of truth for version/build numbers. **No local version-bump step is needed in the release script.**
- There is **no `submit` block yet** — this is greenfield.
- `cli.version` is a floor (`>= 13.0.0`), not a pin. `package.json` pins the devDependency to `eas-cli@^20.5.0`, but the globally installed CLI on this machine reports `16.28.0`. That drift means "which EAS CLI actually runs" depends on which one resolves first on `$PATH` at invocation time — not safe for a script you want to trust blindly.

### Required changes

**Pin `cli.version` to an exact version**, matching whatever `eas-cli` version you've validated the release flow against (e.g. `"20.5.0"`):

```json
"cli": {
  "version": "20.5.0",
  "appVersionSource": "remote"
}
```

This makes `eas build`/`eas submit` refuse to run (and tell you clearly) if the resolved CLI doesn't match, instead of silently building with whatever's on `$PATH`.

**Add a `submit.production` block:**

```json
"submit": {
  "production": {
    "android": {
      "serviceAccountKeyPath": "path/to/service-account.json",
      "track": "internal",
      "releaseStatus": "draft"
    },
    "ios": {
      "appleTeamId": "YOUR_TEAM_ID",
      "ascAppId": "YOUR_APP_STORE_CONNECT_APP_ID",
      "ascApiKeyPath": "path/to/AuthKey_XXXXXXXXXX.p8",
      "ascApiKeyIssuerId": "YOUR_ISSUER_ID",
      "ascApiKeyId": "YOUR_KEY_ID",
      "groups": ["Internal Testers"]
    }
  }
}
```

Notes on the choices:

- **`track: "internal"`** — start on Google Play's internal testing track, not `production`. Graduate to `production` manually in the Play Console once you trust the pipeline (see §7). Revisit this as an open question once you're comfortable — see §8.
- **`releaseStatus: "draft"`** — even on the internal track, `draft` means the release is created but not live until you click publish in the Play Console. This is a safety net: a bad run never reaches any tester automatically. Once you fully trust the automation, this can move to `"completed"`.
- **`groups`** — the exact TestFlight group name is unset (placeholder `"Internal Testers"`) — this is an open question for you in §8.
- **Credential paths** (`serviceAccountKeyPath`, `ascApiKeyPath`) point to local files outside the repo. Never commit these — see §3.

### `app.json` fields

Already correct, no changes needed:

- `ios.bundleIdentifier` = `com.masontuft.groceryscan`
- `android.package` = `com.masontuft.groceryscan`
- `extra.eas.projectId` is registered

These are preconditions, not action items.

## 3. Credentials and Secrets Checklist

### Google Play

- **Service account JSON key**, created in Google Cloud Console and linked to the Play Console under Setup → API access.
- Minimum permission: **Release manager** (or **Admin** if you also want it managing app listings) on this specific app in the Play Console.
- Store the JSON file **outside the repo**, e.g. `~/.secrets/groceryscan/play-service-account.json`. Reference that absolute (or `~`-relative, resolved by the script) path in `serviceAccountKeyPath`. Never commit it — confirm it's covered by a `.gitignore` rule if you ever place it under the repo for convenience.

### App Store Connect

- **API key (`.p8` file)**, generated in App Store Connect → Users and Access → Integrations → App Store Connect API. Requires the **App Manager** role (or stronger) to submit builds and manage TestFlight.
- You'll also need the **Key ID**, **Issuer ID**, and your **Team ID** (visible in the Apple Developer portal membership page).
- Same convention: store the `.p8` outside the repo, reference by path in `ascApiKeyPath`.

### EAS/Expo authentication

- For a fully non-interactive script, use an **`EXPO_TOKEN`** environment variable rather than relying on a cached `eas login` session (which can expire or not exist in a fresh shell). Generate a robot/access token from your Expo account settings and export it in your shell profile or a local `.env` the script sources — not committed.
- This also means the script would work unmodified if you ever add the optional CI trigger in §6, without re-architecting auth.

### One-time interactive steps (cannot be scripted, do these once manually)

1. `eas credentials` (iOS) — generates/attaches the distribution certificate and provisioning profile. Must be done interactively at least once per Apple Developer account/team.
2. First manual TestFlight submission — Apple's export-compliance and license-agreement prompts typically require confirmation via the App Store Connect UI or CLI interactively the very first time; subsequent automated submissions won't re-prompt once these are on file.

## 4. Script Design

Two versions of the same script, same command sequence, different implementation language.

### `scripts/release_production.sh` (Bash)

- Preflight: `eas whoami` to fail fast if not authenticated, before spending any build minutes.
- Build (blocking, both platforms in one call):
  ```
  eas build --platform all --profile production --non-interactive --wait
  ```
- Submit (two explicit, separate calls — see decision below):
  ```
  eas submit --platform android --latest --profile production --non-interactive
  eas submit --platform ios --latest --profile production --non-interactive
  ```

**Decision: separate build and submit steps, not `--auto-submit`.**

- `--auto-submit` on the build command would submit immediately as each platform's build finishes, with no gap to inspect anything.
- Keeping them separate means: (a) a build failure can never trigger a submit attempt (submit only ever runs against a build that already finished successfully), and (b) you get a natural pause point between build and submit if you want to sanity-check something before it reaches a store.
- Trade-off: `--auto-submit` is simpler (one command, one step) and marginally faster since submission for a finished platform can start while the other platform is still building. For a manual "when I'm ready" flow where you're actively watching the terminal, the safety of explicit separation outweighs that speed gain.

### `scripts/release_production.ts` (Node/TypeScript)

- Same exact command sequence, shelled out via `execa` (or plain `child_process.spawn`) — the EAS CLI has no public programmatic JS API for build/submit orchestration, so this is still "run the CLI," just with better ergonomics around it.
- Adds: typed flag parsing (`--dry-run`, `--platform android|ios|all`, `--yes`), structured/leveled logging, and easier extension later (e.g. Slack notification on completion) than the Bash version.
- Positioned as the nicer-DX alternative once the Bash version is proven out — not a replacement for it. Pick one to actually build first; the Bash version is the faster path to something working today.

### Waiting strategy

Use the CLI's own `--wait` flag on the build command rather than hand-rolling a polling loop. `eas build --wait` already blocks and polls EAS's servers natively — reimplementing that would just be more surface area to maintain for no benefit.

## 5. Control Flow and Error Handling

- **Bash**: `set -euo pipefail` at the top of the script so any non-zero exit (build failure, submit failure, missing credential file) aborts the whole run immediately rather than continuing into a broken next step.
- **TypeScript**: wrap each `eas` invocation so a non-zero child-process exit code throws, caught at the top level to produce a clean final error message and matching process exit code.
- **Logging**: prefix every log line with the current stage — `[PREFLIGHT]`, `[BUILD]`, `[SUBMIT:android]`, `[SUBMIT:ios]` — so a failure's location is unambiguous from the terminal output alone, without needing to dig into EAS's own verbose logs first.
- **Idempotency**: EAS doesn't dedupe — running the script twice against the same commit produces two separate builds, which costs build minutes but isn't otherwise harmful. `--latest` on submit always grabs the most recently finished build for that platform, so a duplicate run doesn't submit something stale. Guard against accidental double-runs with an interactive confirmation prompt by default (`Continue with build+submit? [y/N]`), bypassable via an explicit `--yes` flag for genuinely unattended use.

## 6. Manual Trigger Options

- **Primary (this plan's actual target): local terminal.** You run `./scripts/release_production.sh` (or the TS equivalent) yourself, when you decide.
- **Optional, later: a `workflow_dispatch`-only GitHub Actions workflow.**
  ```yaml
  # .github/workflows/release_production.yml
  on:
    workflow_dispatch: {}
  ```
  This workflow would do nothing but check out the repo and invoke the same script — no `push` or `pull_request` triggers, so it never runs automatically. Its only purpose would be a centralized, shareable log of past releases (useful if this ever becomes a team of more than one person). Not part of the initial implementation; revisit only if you want that audit trail.
- **Local vs. CI trade-off**: local is simpler and has zero secrets-in-CI exposure surface, but the log lives only in your terminal history. CI (`workflow_dispatch`) centralizes logs and makes "who ran a release and when" queryable, at the cost of needing to provision the same secrets (`EXPO_TOKEN`, service account JSON, `.p8` key) as encrypted CI secrets instead of local files.

## 7. Validation and Dry-Run Strategy

- **Android**: submit to the `internal` track first (already the default in the `submit.production.android` profile above). Promote to a wider track manually inside the Play Console once you've verified the build behaves correctly for internal testers.
- **iOS**: TestFlight internal testers group only for v1 — a full App Store submission/review is out of scope for this automation and would remain a deliberate, separate manual action in App Store Connect.
- **Dry-run mode**: support a `DRY_RUN=1` environment variable (or `--dry-run` flag in the TS version) that causes the script to print the exact `eas build`/`eas submit` commands it would run — including resolved profile names and flags — without executing them. This lets you rehearse the entire script's control flow (preflight check, stage logging, confirmation prompt) without spending real build minutes or touching any store.

## 8. Open Questions and Customization Hooks

Decisions left to you, not resolved in this plan:

- **Google Play track long-term**: stay on `internal` indefinitely, or graduate to `production` (or a closed/open testing track) once the pipeline is trusted?
- **TestFlight group name(s)**: placeholder `"Internal Testers"` used above — confirm the actual group name(s) configured in App Store Connect.
- **Release status on Android**: `draft` is the safe starting point; decide when (if ever) to switch to `completed` for a hands-off publish.

Extension points worth adding later, once the base script is working:

- **Commit tagging**: tag the exact commit a release was built from (e.g. `release/production/v1.0.4`) so any build can be traced back to source.
- **Changelog generation**: auto-generate release notes from commits/PRs since the last tag, fed into the submit step's "what's new" text.
- **Pre-release checks**: gate the script behind `npx tsc --noEmit` and any lint/test commands before it calls `eas build`, so a broken build never even reaches EAS.

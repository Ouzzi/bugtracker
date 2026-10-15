# @oussama/bugtracker

A drop-in bug reporter you can reuse across all your projects:

- **Floating button + modal** with automatic page **screenshot** capture, plus
  multiple screenshots: remove one (×), add more (＋ / file picker), or paste
  images straight from the clipboard (Ctrl/Cmd+V).
- **Triage page** to view, filter, status-change and annotate reports.
- **Persistence-agnostic** via adapters — local Mongoose DB today, other DBs or a
  central remote inbox by config.
- **Self-contained styles** (no Tailwind required) and fully themeable.

Change it once here, then bump the pinned commit in each consumer project
(see [Updating a consumer](#updating-a-consumer)).

## Install

This package is **not published to any npm registry** (no npmjs.com, no GitHub
Packages). Consumers install it straight from this Git repository, **pinned to a
commit SHA**:

```jsonc
// package.json of the consumer
"dependencies": {
  "@oussama/bugtracker": "git+https://github.com/Ouzzi/bugtracker.git#<commit-sha>"
}
```

or equivalently:

```bash
npm install "git+https://github.com/Ouzzi/bugtracker.git#<commit-sha>"
```

- The package **name** stays `@oussama/bugtracker` (that is what consumers
  import); it is unrelated to the GitHub owner `Ouzzi`. Do not rename it
  without updating every consumer's imports.
- `dist/` is not committed. npm clones the repo and runs the `prepare` script
  (`npm run build`) during install; npm temporarily installs this repo's devDependencies for that
  build, nothing to configure in the consumer.
- Use `git+https://` — the repo is public, so no token or `.npmrc` is needed
  (CI and Docker builds included). `git+ssh://git@github.com/...` also works but
  requires an SSH key wherever `npm ci` runs.
- `"private": true` in package.json blocks an accidental `npm publish` (the
  `@oussama` scope is not ours on npmjs.com); it does not affect Git installs.
- Always pin a full SHA, not a branch: `#master` would make builds
  non-reproducible.

Import the stylesheet once (e.g. in your root layout):

```ts
import "@oussama/bugtracker/styles.css";
```

## Client — button + triage

```tsx
"use client";
import { BugReportButton, BugTrackerView } from "@oussama/bugtracker";
import { toast } from "sonner";

// Floating widget (render once in your app shell):
<BugReportButton
  onSubmitted={() => toast.success("Thanks — your bug report was sent")}
  onError={(msg) => toast.error(msg)}
  theme={{ accent: "#0f172a" }}
/>

// Triage page (admins only — gate the route yourself):
<BugTrackerView formatDate={(d) => new Date(d).toLocaleString()} />
```

## Server — route handlers

`app/api/bugs/route.ts`:

```ts
import { createBugReportHandlers } from "@oussama/bugtracker/server";
import { createMongoosePersistence } from "@oussama/bugtracker/adapters/mongoose";

const handlers = createBugReportHandlers({
  persistence: createMongoosePersistence({ model: BugReport, connect: dbConnect }),
  auth: {
    async getActor() {
      const user = await currentUser();
      return user ? { id: user.id, name: user.name, isAdmin: user.isAdmin } : null;
    },
  },
  // optional:
  upload: createS3Upload(),
  notify: { onNewReport: (r) => notifyAdmins(r.title) },
  rateLimit: { consume: myRateLimiter },
});

export const { POST, GET } = handlers.collection;
```

`app/api/bugs/[id]/route.ts`:

```ts
export const { PATCH } = handlers.item; // re-export from the same config
```

## Persistence options

| Mode | Adapter |
| --- | --- |
| Local DB (default) | `createMongoosePersistence({ model, connect })` |
| Central inbox | `createRemotePersistence({ endpoint, secret, project })` |
| Other DB | implement `PersistenceAdapter` (3 methods: `create`, `list`, `update`) |

Switching modes is a one-line change to the `persistence` value — handlers,
auth, rate-limiting and screenshots are unaffected.

## Updating a consumer

1. Merge the change to `master` here (CI must be green).
2. In the consumer, point the dependency at the new commit and refresh the lockfile:

   ```bash
   npm install "git+https://github.com/Ouzzi/bugtracker.git#<new-master-sha>"
   ```

3. Commit the consumer's `package.json` and `package-lock.json` together.

There is no `npm publish` step; the `version` field is informational only.

## Development

```bash
npm ci             # also builds dist/ via prepare
npm run typecheck
npm test
npm run build
```

The same steps run in GitHub Actions on every push to `master` and every PR.

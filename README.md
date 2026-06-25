# @oussama/bugtracker

A drop-in bug reporter you can reuse across all your projects:

- **Floating button + modal** with automatic page **screenshot** capture, plus
  multiple screenshots: remove one (×), add more (＋ / file picker), or paste
  images straight from the clipboard (Ctrl/Cmd+V).
- **Triage page** to view, filter, status-change and annotate reports.
- **Persistence-agnostic** via adapters — local Mongoose DB today, other DBs or a
  central remote inbox by config.
- **Self-contained styles** (no Tailwind required) and fully themeable.

Change it once here, run `npm update @oussama/bugtracker` in each project.

## Install

Published to GitHub Packages. In each consumer project add an `.npmrc`:

```
@oussama:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=YOUR_TOKEN
```

```bash
npm install @oussama/bugtracker
```

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

## Publishing a change

```bash
npm version patch
npm publish            # to GitHub Packages
# then in each project:
npm update @oussama/bugtracker
```

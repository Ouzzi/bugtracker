import { describe, expect, it } from "vitest";
import { createBugReportHandlers } from "../src/server/handlers";
import type { Actor, PersistenceAdapter } from "../src/server/types";
import type { BugReportRecord } from "../src/types";

function memoryPersistence() {
  const rows: BugReportRecord[] = [];
  /** Every query the GET handler handed down, so tests can assert the paging it derived. */
  const listCalls: Parameters<PersistenceAdapter["list"]>[0][] = [];
  let seq = 0;
  const adapter: PersistenceAdapter = {
    async create(input) {
      const now = new Date().toISOString();
      const rec: BugReportRecord = {
        id: String(++seq),
        status: "open",
        adminNote: "",
        createdAt: now,
        updatedAt: now,
        ...input,
      } as BugReportRecord;
      rows.push(rec);
      return rec;
    },
    async list(q) {
      listCalls.push(q);
      const filtered = q.status ? rows.filter((b) => b.status === q.status) : rows;
      return { bugs: filtered.slice(q.skip, q.skip + q.limit), total: filtered.length };
    },
    async update(id, patch) {
      const rec = rows.find((b) => b.id === id);
      if (!rec) return null;
      Object.assign(rec, patch, { updatedAt: new Date().toISOString() });
      return rec;
    },
  };
  return { rows, adapter, listCalls };
}

function makeHandlers(actor: Actor | null, opts: { rateOk?: boolean } = {}) {
  const store = memoryPersistence();
  const h = createBugReportHandlers({
    persistence: store.adapter,
    auth: { getActor: async () => actor },
    rateLimit: { consume: async () => opts.rateOk ?? true },
  });
  return { ...h, store };
}

function form(fields: Record<string, string>, file?: File) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.append(k, v);
  if (file) fd.append("screenshot", file, file.name);
  return new Request("http://localhost/api/bugs", { method: "POST", body: fd });
}

const member: Actor = { id: "u1", name: "Member", email: "m@e.com", isAdmin: false };
const admin: Actor = { id: "a1", name: "Admin", email: "a@e.com", isAdmin: true };

describe("createBugReportHandlers", () => {
  it("requires sign-in to file (401)", async () => {
    const { collection } = makeHandlers(null);
    const res = await collection.POST(form({ title: "x" }));
    expect(res.status).toBe(401);
  });

  it("rejects a missing title (400)", async () => {
    const { collection } = makeHandlers(member);
    const res = await collection.POST(form({ description: "no title" }));
    expect(res.status).toBe(400);
  });

  it("files a report with the no-screenshot note (201)", async () => {
    const { collection, store } = makeHandlers(member);
    const res = await collection.POST(form({ title: "Broken", pageUrl: "/x" }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.screenshotSaved).toBe(false);
    expect(body.screenshotNote).toBe("No screenshot was captured in the browser");
    expect(store.rows[0].title).toBe("Broken");
    expect(store.rows[0].reporterId).toBe("u1");
    expect(store.rows[0].status).toBe("open");
  });

  it("notes unconfigured storage when a file is attached but no upload adapter", async () => {
    const { collection } = makeHandlers(member);
    const file = new File([new Uint8Array([1, 2, 3])], "s.jpg", { type: "image/jpeg" });
    const res = await collection.POST(form({ title: "With shot" }, file));
    const body = await res.json();
    expect(body.screenshotNote).toBe("Object storage (S3) is not configured on the server");
  });

  it("uploads multiple screenshots and reports the count", async () => {
    const store = memoryPersistence();
    const uploaded: string[] = [];
    const h = createBugReportHandlers({
      persistence: store.adapter,
      auth: { getActor: async () => member },
      upload: {
        isConfigured: () => true,
        upload: async (key) => {
          uploaded.push(key);
          return `https://cdn.test/${key}`;
        },
      },
    });
    const fd = new FormData();
    fd.append("title", "Two shots");
    fd.append("screenshot", new File([new Uint8Array([1])], "a.png", { type: "image/png" }), "a.png");
    fd.append("screenshot", new File([new Uint8Array([2])], "b.jpg", { type: "image/jpeg" }), "b.jpg");
    const res = await h.collection.POST(
      new Request("http://localhost/api/bugs", { method: "POST", body: fd }),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.screenshotSaved).toBe(true);
    expect(body.screenshotCount).toBe(2);
    expect(uploaded).toHaveLength(2);
    expect(store.rows[0].screenshots).toHaveLength(2);
    expect(store.rows[0].screenshots[0].url).toMatch(/^https:\/\/cdn\.test\//);
  });

  it("caps the number of screenshots and notes the overflow", async () => {
    const store = memoryPersistence();
    let uploads = 0;
    const h = createBugReportHandlers({
      persistence: store.adapter,
      auth: { getActor: async () => member },
      limits: { maxScreenshots: 2 },
      upload: {
        isConfigured: () => true,
        upload: async (key) => {
          uploads++;
          return `https://cdn.test/${key}`;
        },
      },
    });
    const fd = new FormData();
    fd.append("title", "Many shots");
    for (let i = 0; i < 5; i++) {
      fd.append("screenshot", new File([new Uint8Array([i])], `s${i}.png`, { type: "image/png" }), `s${i}.png`);
    }
    const res = await h.collection.POST(
      new Request("http://localhost/api/bugs", { method: "POST", body: fd }),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.screenshotCount).toBe(2);
    expect(uploads).toBe(2);
    expect(store.rows[0].screenshots).toHaveLength(2);
    expect(body.screenshotNote).toContain("Too many screenshots");
  });

  it("treats an empty upload URL as a failed screenshot", async () => {
    const store = memoryPersistence();
    const h = createBugReportHandlers({
      persistence: store.adapter,
      auth: { getActor: async () => member },
      upload: { isConfigured: () => true, upload: async () => "" },
    });
    const fd = new FormData();
    fd.append("title", "Empty url");
    fd.append("screenshot", new File([new Uint8Array([1])], "a.png", { type: "image/png" }), "a.png");
    const res = await h.collection.POST(
      new Request("http://localhost/api/bugs", { method: "POST", body: fd }),
    );
    const body = await res.json();
    expect(body.screenshotSaved).toBe(false);
    expect(body.screenshotCount).toBe(0);
    expect(store.rows[0].screenshots).toHaveLength(0);
    expect(body.screenshotNote).toContain("upload failed");
  });

  describe("triage paging", () => {
    /** An admin handler set with `count` reports already filed. */
    async function seeded(count: number) {
      const h = makeHandlers(admin);
      for (let i = 0; i < count; i++) await h.collection.POST(form({ title: `bug ${i}` }));
      return h;
    }
    /** Runs the triage GET with `query` appended and reports what the adapter saw. */
    async function list(h: Awaited<ReturnType<typeof seeded>>, query: string) {
      const res = await h.collection.GET(new Request(`http://localhost/api/bugs${query}`));
      expect(res.status).toBe(200);
      const body = await res.json();
      return { body, q: h.store.listCalls[h.store.listCalls.length - 1] };
    }

    it("defaults a missing ?limit to 50, not to 1", async () => {
      // Regression: `Number(null)` is 0 — finite — so the old `isFinite` guard
      // accepted it, the fallback never ran, and the clamp turned it into 1.
      // The list then showed a single report while `total` said three.
      const h = await seeded(3);
      const { body, q } = await list(h, "");
      expect(q.limit).toBe(50);
      expect(q.skip).toBe(0);
      expect(body.bugs).toHaveLength(3);
      expect(body.total).toBe(3);
    });

    it("defaults a blank ?limit= to 50 as well", async () => {
      // `Number("")` is 0 too, so the empty string fell into the same hole.
      const h = await seeded(3);
      const { body, q } = await list(h, "?limit=&skip=");
      expect(q.limit).toBe(50);
      expect(q.skip).toBe(0);
      expect(body.bugs).toHaveLength(3);
    });

    it("ignores a non-numeric ?limit instead of passing NaN to the adapter", async () => {
      const h = await seeded(3);
      const { body, q } = await list(h, "?limit=abc&skip=xyz");
      expect(q.limit).toBe(50);
      expect(q.skip).toBe(0);
      expect(body.bugs).toHaveLength(3); // a NaN limit would slice to an empty list
    });

    it("respects an explicit ?limit=1", async () => {
      const h = await seeded(3);
      const { body, q } = await list(h, "?limit=1");
      expect(q.limit).toBe(1);
      expect(body.bugs).toHaveLength(1);
      expect(body.total).toBe(3); // the counter still reports the full set
    });

    it("respects ?skip and pages through the set", async () => {
      const h = await seeded(3);
      const { body, q } = await list(h, "?limit=2&skip=2");
      expect(q).toMatchObject({ limit: 2, skip: 2 });
      expect(body.bugs).toHaveLength(1);
    });

    it("clamps an out-of-range ?limit and a negative ?skip", async () => {
      const h = await seeded(1);
      expect((await list(h, "?limit=999")).q.limit).toBe(100);
      expect((await list(h, "?limit=0")).q.limit).toBe(1);
      expect((await list(h, "?limit=-7")).q.limit).toBe(1);
      expect((await list(h, "?skip=-5")).q.skip).toBe(0);
    });

    it("truncates a fractional ?limit to a whole number", async () => {
      const h = await seeded(1);
      expect((await list(h, "?limit=2.9")).q.limit).toBe(2);
    });
  });

  it("blocks 429 when rate limited", async () => {
    const { collection } = makeHandlers(member, { rateOk: false });
    const res = await collection.POST(form({ title: "x" }));
    expect(res.status).toBe(429);
  });

  it("gates triage list to admins", async () => {
    const memberH = makeHandlers(member);
    expect((await memberH.collection.GET(new Request("http://localhost/api/bugs"))).status).toBe(403);

    const adminH = makeHandlers(admin);
    await adminH.collection.POST(form({ title: "a" }));
    const listRes = await adminH.collection.GET(new Request("http://localhost/api/bugs"));
    expect(listRes.status).toBe(200);
    expect((await listRes.json()).bugs).toHaveLength(1);
  });

  it("gates + applies triage updates", async () => {
    const adminH = makeHandlers(admin);
    await adminH.collection.POST(form({ title: "a" }));
    const id = adminH.store.rows[0].id;

    const memberH = createBugReportHandlers({
      persistence: adminH.store.adapter,
      auth: { getActor: async () => member },
    });
    const denied = await memberH.item.PATCH(
      new Request(`http://localhost/api/bugs/${id}`, { method: "PATCH", body: "{}" }),
      { params: Promise.resolve({ id }) },
    );
    expect(denied.status).toBe(403);

    const ok = await adminH.item.PATCH(
      new Request(`http://localhost/api/bugs/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "resolved", adminNote: "dup" }),
      }),
      { params: Promise.resolve({ id }) },
    );
    expect(ok.status).toBe(200);
    expect((await ok.json()).bug.status).toBe("resolved");

    const missing = await adminH.item.PATCH(
      new Request("http://localhost/api/bugs/nope", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "open" }),
      }),
      { params: Promise.resolve({ id: "nope" }) },
    );
    expect(missing.status).toBe(404);
  });
});

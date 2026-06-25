import { describe, expect, it } from "vitest";
import { createBugReportHandlers } from "../src/server/handlers";
import type { Actor, PersistenceAdapter } from "../src/server/types";
import type { BugReportRecord } from "../src/types";

function memoryPersistence() {
  const rows: BugReportRecord[] = [];
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
  return { rows, adapter };
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

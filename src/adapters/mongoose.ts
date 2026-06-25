/* eslint-disable @typescript-eslint/no-explicit-any -- structural typing over an
   injected Mongoose model keeps this adapter independent of the host's exact types. */
import type {
  BugReportRecord,
  ListQuery,
  NewBugReport,
  UpdatePatch,
} from "../types.js";
import type { PersistenceAdapter } from "../server/types.js";

type AnyDoc = Record<string, any>;

/** The slice of a Mongoose model this adapter uses. Deliberately permissive so a
 *  real `Model<...>` is assignable without a cast. */
export interface MongooseBugModel {
  create(doc: any): any;
  find(filter: any): any;
  findByIdAndUpdate(id: any, update: any, options: any): any;
  countDocuments(filter: any): any;
}

export interface MongoosePersistenceOptions {
  /** Your existing BugReport model. If omitted, a default model is created lazily
   *  (requires `mongoose` to be installed). */
  model?: MongooseBugModel;
  /** Called before each operation — e.g. your `dbConnect()`. */
  connect?: () => Promise<unknown>;
  /** Ref model name for the reporter populate. Set to null to skip populate
   *  (projects without a User model). Default "User". */
  reporterRef?: string | null;
  /** Fields selected when populating the reporter. Default "name email". */
  reporterFields?: string;
}

function toRecord(doc: AnyDoc): BugReportRecord {
  const u = doc.userId;
  const populated = u && typeof u === "object" && ("name" in u || "email" in u);
  const asIso = (v: unknown) =>
    v instanceof Date ? v.toISOString() : v ? String(v) : "";
  return {
    id: String(doc._id),
    reporterId: populated
      ? u._id
        ? String(u._id)
        : undefined
      : u
        ? String(u)
        : null,
    reporterName: populated ? (u.name ?? undefined) : undefined,
    reporterEmail: populated ? (u.email ?? undefined) : undefined,
    title: doc.title ?? "",
    description: doc.description ?? "",
    // Prefer the screenshots array; fall back to a legacy single-screenshot row.
    screenshots:
      Array.isArray(doc.screenshots) && doc.screenshots.length
        ? doc.screenshots.map((s: AnyDoc) => ({ url: s.url, key: s.key ?? undefined }))
        : doc.screenshotUrl
          ? [{ url: doc.screenshotUrl, key: doc.screenshotKey || undefined }]
          : [],
    screenshotNote: doc.screenshotNote ?? "",
    pageUrl: doc.pageUrl ?? "",
    userAgent: doc.userAgent ?? "",
    status: doc.status ?? "open",
    adminNote: doc.adminNote ?? "",
    project: doc.project ?? undefined,
    createdAt: asIso(doc.createdAt),
    updatedAt: asIso(doc.updatedAt),
  };
}

let defaultModelPromise: Promise<MongooseBugModel> | null = null;

async function buildDefaultModel(): Promise<MongooseBugModel> {
  const mongoose = (await import("mongoose")).default;
  const { Schema } = mongoose;
  const schema = new Schema(
    {
      userId: { type: Schema.Types.ObjectId, ref: "User" },
      title: { type: String, required: true, trim: true },
      description: { type: String, default: "" },
      screenshots: { type: [{ url: String, key: String }], default: [] },
      screenshotNote: { type: String, default: "" },
      pageUrl: { type: String, default: "" },
      userAgent: { type: String, default: "" },
      status: { type: String, default: "open" },
      adminNote: { type: String, default: "" },
      project: { type: String, default: "" },
    },
    { timestamps: true },
  );
  schema.index({ status: 1, createdAt: -1 });
  return (mongoose.models.BugReport as MongooseBugModel) ??
    (mongoose.model("BugReport", schema) as unknown as MongooseBugModel);
}

/**
 * Persistence backed by a Mongoose model. Pass your own `model` (recommended, so
 * its schema/indexes stay in your control) or let the adapter create a default one.
 */
export function createMongoosePersistence(
  options: MongoosePersistenceOptions = {},
): PersistenceAdapter {
  const { connect, reporterRef = "User", reporterFields = "name email" } = options;

  async function model(): Promise<MongooseBugModel> {
    if (options.model) return options.model;
    if (!defaultModelPromise) defaultModelPromise = buildDefaultModel();
    return defaultModelPromise;
  }

  function withReporter(query: any): any {
    return reporterRef ? query.populate("userId", reporterFields) : query;
  }

  return {
    async create(input: NewBugReport): Promise<BugReportRecord> {
      await connect?.();
      const m = await model();
      const doc = await m.create({
        userId: input.reporterId ?? undefined,
        title: input.title,
        description: input.description,
        screenshots: input.screenshots,
        screenshotNote: input.screenshotNote,
        pageUrl: input.pageUrl,
        userAgent: input.userAgent,
        ...(input.project ? { project: input.project } : {}),
      });
      return toRecord(doc);
    },

    async list(query: ListQuery) {
      await connect?.();
      const m = await model();
      const filter: AnyDoc = {};
      if (query.status) filter.status = query.status;
      if (query.project) filter.project = query.project;
      const [docs, total] = await Promise.all([
        withReporter(
          m.find(filter).sort({ createdAt: -1 }).skip(query.skip).limit(query.limit),
        ).lean(),
        m.countDocuments(filter),
      ]);
      return { bugs: (docs as AnyDoc[]).map(toRecord), total };
    },

    async update(id: string, patch: UpdatePatch): Promise<BugReportRecord | null> {
      await connect?.();
      const m = await model();
      const set: AnyDoc = {};
      if (patch.status !== undefined) set.status = patch.status;
      if (patch.adminNote !== undefined) set.adminNote = patch.adminNote;
      const doc = await withReporter(
        // `returnDocument: "after"` is the non-deprecated equivalent of `new: true`
        // (Mongoose 6+); returns the updated document.
        m.findByIdAndUpdate(id, { $set: set }, { returnDocument: "after" }),
      ).lean();
      return doc ? toRecord(doc as AnyDoc) : null;
    },
  };
}

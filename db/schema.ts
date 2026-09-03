import { sql } from "drizzle-orm";
import { index, integer, primaryKey, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const users = sqliteTable(
  "users",
  {
    email: text("email").primaryKey(),
    publicId: text("public_id"),
    displayName: text("display_name").notNull(),
    handle: text("handle").notNull(),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [uniqueIndex("users_public_id_unique").on(table.publicId)],
);

export const universities = sqliteTable("universities", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  shortName: text("short_name").notNull(),
  city: text("city").notNull(),
});

export const faculties = sqliteTable("faculties", {
  id: text("id").primaryKey(),
  universityId: text("university_id")
    .notNull()
    .references(() => universities.id),
  name: text("name").notNull(),
  shortName: text("short_name").notNull(),
});

export const departments = sqliteTable("departments", {
  id: text("id").primaryKey(),
  facultyId: text("faculty_id").references(() => faculties.id),
  name: text("name").notNull(),
});

export const courses = sqliteTable("courses", {
  id: text("id").primaryKey(),
  departmentId: text("department_id")
    .notNull()
    .references(() => departments.id),
  code: text("code").notNull(),
  name: text("name").notNull(),
});

export const studentProfiles = sqliteTable("student_profiles", {
  userEmail: text("user_email")
    .primaryKey()
    .references(() => users.email, { onDelete: "cascade" }),
  universityId: text("university_id")
    .notNull()
    .references(() => universities.id),
  departmentId: text("department_id")
    .notNull()
    .references(() => departments.id),
  classYear: integer("class_year").notNull(),
  onboardingCompleted: integer("onboarding_completed", { mode: "boolean" })
    .notNull()
    .default(true),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const studentCourses = sqliteTable(
  "student_courses",
  {
    userEmail: text("user_email")
      .notNull()
      .references(() => users.email, { onDelete: "cascade" }),
    courseId: text("course_id")
      .notNull()
      .references(() => courses.id),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [primaryKey({ columns: [table.userEmail, table.courseId] })],
);

export const posts = sqliteTable(
  "posts",
  {
    id: text("id").primaryKey(),
    authorEmail: text("author_email")
      .notNull()
      .references(() => users.email, { onDelete: "cascade" }),
    courseId: text("course_id").references(() => courses.id),
    communityId: text("community_id"),
    content: text("content").notNull(),
    isPinned: integer("is_pinned", { mode: "boolean" }).notNull().default(false),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    deletedAt: text("deleted_at"),
  },
  (table) => [
    index("posts_created_at_idx").on(table.createdAt),
    index("posts_author_created_idx").on(table.authorEmail, table.createdAt),
  ],
);

export const postLikes = sqliteTable(
  "post_likes",
  {
    postId: text("post_id")
      .notNull()
      .references(() => posts.id, { onDelete: "cascade" }),
    userEmail: text("user_email")
      .notNull()
      .references(() => users.email, { onDelete: "cascade" }),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [primaryKey({ columns: [table.postId, table.userEmail] })],
);

export const postSaves = sqliteTable(
  "post_saves",
  {
    postId: text("post_id")
      .notNull()
      .references(() => posts.id, { onDelete: "cascade" }),
    userEmail: text("user_email")
      .notNull()
      .references(() => users.email, { onDelete: "cascade" }),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [primaryKey({ columns: [table.postId, table.userEmail] })],
);

export const postComments = sqliteTable(
  "post_comments",
  {
    id: text("id").primaryKey(),
    postId: text("post_id")
      .notNull()
      .references(() => posts.id, { onDelete: "cascade" }),
    authorEmail: text("author_email")
      .notNull()
      .references(() => users.email, { onDelete: "cascade" }),
    content: text("content").notNull(),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    deletedAt: text("deleted_at"),
  },
  (table) => [
    index("post_comments_post_created_idx").on(table.postId, table.createdAt),
    index("post_comments_author_idx").on(table.authorEmail),
  ],
);

export const userFollows = sqliteTable(
  "user_follows",
  {
    followerEmail: text("follower_email")
      .notNull()
      .references(() => users.email, { onDelete: "cascade" }),
    followingEmail: text("following_email")
      .notNull()
      .references(() => users.email, { onDelete: "cascade" }),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    primaryKey({ columns: [table.followerEmail, table.followingEmail] }),
    index("user_follows_follower_idx").on(table.followerEmail),
    index("user_follows_following_idx").on(table.followingEmail),
  ],
);

export const notes = sqliteTable(
  "notes",
  {
    id: text("id").primaryKey(),
    ownerEmail: text("owner_email")
      .notNull()
      .references(() => users.email, { onDelete: "cascade" }),
    courseId: text("course_id")
      .notNull()
      .references(() => courses.id),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    noteType: text("note_type").notNull().default("ders-notu"),
    tagsJson: text("tags_json").notNull().default("[]"),
    objectKey: text("object_key").notNull(),
    originalFileName: text("original_file_name").notNull(),
    contentType: text("content_type").notNull(),
    byteSize: integer("byte_size").notNull(),
    pageCount: integer("page_count"),
    status: text("status").notNull().default("processing"),
    rejectionReason: text("rejection_reason"),
    publishedAt: text("published_at"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    deletedAt: text("deleted_at"),
  },
  (table) => [
    index("notes_course_status_created_idx").on(table.courseId, table.status, table.createdAt),
    index("notes_owner_created_idx").on(table.ownerEmail, table.createdAt),
    uniqueIndex("notes_object_key_unique").on(table.objectKey),
  ],
);

export const noteSaves = sqliteTable(
  "note_saves",
  {
    noteId: text("note_id").notNull().references(() => notes.id, { onDelete: "cascade" }),
    userEmail: text("user_email").notNull().references(() => users.email, { onDelete: "cascade" }),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [primaryKey({ columns: [table.noteId, table.userEmail] })],
);

export const noteViews = sqliteTable(
  "note_views",
  {
    noteId: text("note_id").notNull().references(() => notes.id, { onDelete: "cascade" }),
    userEmail: text("user_email").notNull().references(() => users.email, { onDelete: "cascade" }),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [primaryKey({ columns: [table.noteId, table.userEmail] })],
);

export const communities = sqliteTable(
  "communities",
  {
    id: text("id").primaryKey(),
    creatorEmail: text("creator_email").notNull().references(() => users.email, { onDelete: "cascade" }),
    courseId: text("course_id").references(() => courses.id),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    description: text("description").notNull().default(""),
    category: text("category").notNull().default("ilgi"),
    joinPolicy: text("join_policy").notNull().default("open"),
    rules: text("rules").notNull().default(""),
    status: text("status").notNull().default("active"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    archivedAt: text("archived_at"),
  },
  (table) => [
    uniqueIndex("communities_slug_unique").on(table.slug),
    index("communities_status_created_idx").on(table.status, table.createdAt),
  ],
);

export const communityMembers = sqliteTable(
  "community_members",
  {
    communityId: text("community_id").notNull().references(() => communities.id, { onDelete: "cascade" }),
    userEmail: text("user_email").notNull().references(() => users.email, { onDelete: "cascade" }),
    role: text("role").notNull().default("member"),
    status: text("status").notNull().default("active"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    primaryKey({ columns: [table.communityId, table.userEmail] }),
    index("community_members_user_status_idx").on(table.userEmail, table.status),
  ],
);

export const communityAuditLogs = sqliteTable(
  "community_audit_logs",
  {
    id: text("id").primaryKey(),
    communityId: text("community_id").notNull().references(() => communities.id, { onDelete: "cascade" }),
    actorEmail: text("actor_email").notNull().references(() => users.email, { onDelete: "cascade" }),
    action: text("action").notNull(),
    targetEmail: text("target_email"),
    detail: text("detail").notNull().default("{}"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index("community_audit_community_created_idx").on(table.communityId, table.createdAt)],
);

export const notifications = sqliteTable(
  "notifications",
  {
    id: text("id").primaryKey(),
    userEmail: text("user_email").notNull().references(() => users.email, { onDelete: "cascade" }),
    actorEmail: text("actor_email").references(() => users.email, { onDelete: "set null" }),
    kind: text("kind").notNull(),
    title: text("title").notNull(),
    body: text("body").notNull().default(""),
    entityType: text("entity_type"),
    entityId: text("entity_id"),
    readAt: text("read_at"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index("notifications_user_read_created_idx").on(table.userEmail, table.readAt, table.createdAt)],
);

export const notificationPreferences = sqliteTable("notification_preferences", {
  userEmail: text("user_email").primaryKey().references(() => users.email, { onDelete: "cascade" }),
  interactions: integer("interactions", { mode: "boolean" }).notNull().default(true),
  courses: integer("courses", { mode: "boolean" }).notNull().default(true),
  communities: integer("communities", { mode: "boolean" }).notNull().default(true),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const userBlocks = sqliteTable(
  "user_blocks",
  {
    blockerEmail: text("blocker_email").notNull().references(() => users.email, { onDelete: "cascade" }),
    blockedEmail: text("blocked_email").notNull().references(() => users.email, { onDelete: "cascade" }),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [primaryKey({ columns: [table.blockerEmail, table.blockedEmail] })],
);

export const userMutes = sqliteTable(
  "user_mutes",
  {
    muterEmail: text("muter_email").notNull().references(() => users.email, { onDelete: "cascade" }),
    mutedEmail: text("muted_email").notNull().references(() => users.email, { onDelete: "cascade" }),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [primaryKey({ columns: [table.muterEmail, table.mutedEmail] })],
);

export const contentReports = sqliteTable(
  "content_reports",
  {
    id: text("id").primaryKey(),
    reporterEmail: text("reporter_email").notNull().references(() => users.email, { onDelete: "cascade" }),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    reason: text("reason").notNull(),
    details: text("details").notNull().default(""),
    evidenceJson: text("evidence_json").notNull().default("{}"),
    status: text("status").notNull().default("open"),
    decision: text("decision"),
    decidedByEmail: text("decided_by_email").references(() => users.email, { onDelete: "set null" }),
    decidedAt: text("decided_at"),
    appealText: text("appeal_text"),
    appealedAt: text("appealed_at"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index("content_reports_status_created_idx").on(table.status, table.createdAt)],
);

export const platformRoles = sqliteTable(
  "platform_roles",
  {
    userEmail: text("user_email").notNull().references(() => users.email, { onDelete: "cascade" }),
    role: text("role").notNull(),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [primaryKey({ columns: [table.userEmail, table.role] })],
);

export const auditLogs = sqliteTable(
  "audit_logs",
  {
    id: text("id").primaryKey(),
    actorEmail: text("actor_email").notNull(),
    action: text("action").notNull(),
    entityType: text("entity_type"),
    entityId: text("entity_id"),
    detail: text("detail").notNull().default("{}"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index("audit_logs_actor_created_idx").on(table.actorEmail, table.createdAt)],
);

export const rateLimitWindows = sqliteTable(
  "rate_limit_windows",
  {
    actorEmail: text("actor_email").notNull(),
    action: text("action").notNull(),
    windowStart: integer("window_start").notNull(),
    hitCount: integer("hit_count").notNull().default(1),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [primaryKey({ columns: [table.actorEmail, table.action, table.windowStart] })],
);

export const pilotInvites = sqliteTable(
  "pilot_invites",
  {
    id: text("id").primaryKey(),
    codeHash: text("code_hash").notNull(),
    createdByEmail: text("created_by_email").notNull().references(() => users.email, { onDelete: "cascade" }),
    claimedByEmail: text("claimed_by_email").references(() => users.email, { onDelete: "set null" }),
    expiresAt: text("expires_at").notNull(),
    claimedAt: text("claimed_at"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [uniqueIndex("pilot_invites_code_hash_unique").on(table.codeHash)],
);

export const productEvents = sqliteTable(
  "product_events",
  {
    id: text("id").primaryKey(),
    userEmail: text("user_email").notNull().references(() => users.email, { onDelete: "cascade" }),
    name: text("name").notNull(),
    propertiesJson: text("properties_json").notNull().default("{}"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index("product_events_name_created_idx").on(table.name, table.createdAt)],
);

export const productFeedback = sqliteTable(
  "product_feedback",
  {
    id: text("id").primaryKey(),
    userEmail: text("user_email").notNull().references(() => users.email, { onDelete: "cascade" }),
    rating: integer("rating").notNull(),
    message: text("message").notNull(),
    status: text("status").notNull().default("new"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index("product_feedback_status_created_idx").on(table.status, table.createdAt)],
);

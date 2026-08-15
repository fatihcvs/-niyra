import { sql } from "drizzle-orm";
import { index, integer, primaryKey, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const users = sqliteTable(
  "users",
  {
    email: text("email").primaryKey(),
    publicId: text("public_id"),
    displayName: text("display_name").notNull(),
    handle: text("handle").notNull(),
    campusVerified: integer("campus_verified", { mode: "boolean" }).notNull().default(false),
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
    content: text("content").notNull(),
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

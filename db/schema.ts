import { sql } from "drizzle-orm";
import { foreignKey, index, integer, primaryKey, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const users = sqliteTable(
  "users",
  {
    email: text("email").primaryKey(),
    publicId: text("public_id"),
    displayName: text("display_name").notNull(),
    handle: text("handle").notNull(),
    status: text("status").notNull().default("active"),
    suspendedAt: text("suspended_at"),
    suspendedReason: text("suspended_reason"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [uniqueIndex("users_public_id_unique").on(table.publicId)],
);

export const userCredentials = sqliteTable("user_credentials", {
  userEmail: text("user_email")
    .primaryKey()
    .references(() => users.email, { onDelete: "cascade" }),
  passwordHash: text("password_hash").notNull(),
  passwordSalt: text("password_salt").notNull(),
  passwordIterations: integer("password_iterations").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const userSessions = sqliteTable(
  "user_sessions",
  {
    tokenHash: text("token_hash").primaryKey(),
    userEmail: text("user_email")
      .notNull()
      .references(() => users.email, { onDelete: "cascade" }),
    expiresAt: text("expires_at").notNull(),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("user_sessions_user_expires_idx").on(table.userEmail, table.expiresAt),
    index("user_sessions_expires_idx").on(table.expiresAt),
  ],
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
  bio: text("bio").notNull().default(""),
  linksJson: text("links_json").notNull().default("[]"),
  onboardingCompleted: integer("onboarding_completed", { mode: "boolean" })
    .notNull()
    .default(true),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const profileMedia = sqliteTable(
  "profile_media",
  {
    userEmail: text("user_email")
      .notNull()
      .references(() => users.email, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    objectKey: text("object_key").notNull(),
    originalFileName: text("original_file_name").notNull(),
    contentType: text("content_type").notNull(),
    byteSize: integer("byte_size").notNull(),
    width: integer("width"),
    height: integer("height"),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    primaryKey({ columns: [table.userEmail, table.kind] }),
    index("profile_media_kind_updated_idx").on(table.kind, table.updatedAt),
  ],
);

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

export const studentSocialProfiles = sqliteTable("student_social_profiles", {
  userEmail: text("user_email").primaryKey().references(() => users.email, { onDelete: "cascade" }),
  interestsJson: text("interests_json").notNull().default("[]"),
  intentsJson: text("intents_json").notNull().default("[]"),
  socialBio: text("social_bio").notNull().default(""),
  availability: text("availability").notNull().default("not-looking"),
  isDiscoverable: integer("is_discoverable", { mode: "boolean" }).notNull().default(true),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const meetupRequests = sqliteTable(
  "meetup_requests",
  {
    id: text("id").primaryKey(),
    senderEmail: text("sender_email").notNull().references(() => users.email, { onDelete: "cascade" }),
    recipientEmail: text("recipient_email").notNull().references(() => users.email, { onDelete: "cascade" }),
    activity: text("activity").notNull(),
    message: text("message").notNull().default(""),
    proposedTime: text("proposed_time"),
    campusPlace: text("campus_place").notNull().default(""),
    status: text("status").notNull().default("pending"),
    expiresAt: text("expires_at").notNull(),
    respondedAt: text("responded_at"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("meetup_requests_recipient_status_idx").on(table.recipientEmail, table.status, table.createdAt),
    index("meetup_requests_sender_status_idx").on(table.senderEmail, table.status, table.createdAt),
  ],
);

export const campusPlaces = sqliteTable(
  "campus_places",
  {
    id: text("id").primaryKey(),
    universityId: text("university_id").notNull().references(() => universities.id),
    creatorEmail: text("creator_email").notNull().references(() => users.email, { onDelete: "cascade" }),
    name: text("name").notNull(),
    category: text("category").notNull(),
    description: text("description").notNull().default(""),
    address: text("address").notNull().default(""),
    latitude: real("latitude"),
    longitude: real("longitude"),
    accessibilityJson: text("accessibility_json").notNull().default("[]"),
    openingHours: text("opening_hours").notNull().default(""),
    status: text("status").notNull().default("active"),
    verifiedAt: text("verified_at"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("campus_places_university_category_idx").on(table.universityId, table.category, table.status),
    index("campus_places_university_updated_idx").on(table.universityId, table.updatedAt),
  ],
);

export const campusPlaceConfirmations = sqliteTable(
  "campus_place_confirmations",
  {
    placeId: text("place_id").notNull().references(() => campusPlaces.id, { onDelete: "cascade" }),
    userEmail: text("user_email").notNull().references(() => users.email, { onDelete: "cascade" }),
    state: text("state").notNull(),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [primaryKey({ columns: [table.placeId, table.userEmail] })],
);

export const housingDiscussions = sqliteTable(
  "housing_discussions",
  {
    id: text("id").primaryKey(),
    placeId: text("place_id").notNull().references(() => campusPlaces.id, { onDelete: "cascade" }),
    authorEmail: text("author_email").notNull().references(() => users.email, { onDelete: "cascade" }),
    content: text("content").notNull(),
    isAnonymous: integer("is_anonymous", { mode: "boolean" }).notNull().default(false),
    status: text("status").notNull().default("active"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("housing_discussions_place_status_created_idx").on(table.placeId, table.status, table.createdAt),
    index("housing_discussions_author_created_idx").on(table.authorEmail, table.createdAt),
  ],
);

export const libraryAreas = sqliteTable(
  "library_areas",
  {
    id: text("id").primaryKey(),
    universityId: text("university_id").notNull().references(() => universities.id),
    placeId: text("place_id").references(() => campusPlaces.id, { onDelete: "set null" }),
    creatorEmail: text("creator_email").notNull().references(() => users.email, { onDelete: "cascade" }),
    name: text("name").notNull(),
    floorLabel: text("floor_label").notNull().default(""),
    zoneLabel: text("zone_label").notNull().default(""),
    description: text("description").notNull().default(""),
    capacity: integer("capacity"),
    featuresJson: text("features_json").notNull().default("[]"),
    status: text("status").notNull().default("active"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("library_areas_university_status_idx").on(table.universityId, table.status, table.updatedAt),
    index("library_areas_place_idx").on(table.placeId, table.status),
  ],
);

export const libraryCheckins = sqliteTable(
  "library_checkins",
  {
    id: text("id").primaryKey(),
    areaId: text("area_id").notNull().references(() => libraryAreas.id, { onDelete: "cascade" }),
    userEmail: text("user_email").notNull().references(() => users.email, { onDelete: "cascade" }),
    status: text("status").notNull().default("active"),
    expiresAt: text("expires_at").notNull(),
    checkedOutAt: text("checked_out_at"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("library_checkins_area_status_expiry_idx").on(table.areaId, table.status, table.expiresAt),
    uniqueIndex("library_checkins_one_active_user_idx").on(table.userEmail).where(sql`${table.status} = 'active'`),
  ],
);

export const campusEvents = sqliteTable(
  "campus_events",
  {
    id: text("id").primaryKey(),
    universityId: text("university_id").notNull().references(() => universities.id),
    creatorEmail: text("creator_email").notNull().references(() => users.email, { onDelete: "cascade" }),
    placeId: text("place_id").references(() => campusPlaces.id, { onDelete: "set null" }),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    category: text("category").notNull(),
    startsAt: text("starts_at").notNull(),
    endsAt: text("ends_at"),
    status: text("status").notNull().default("active"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index("campus_events_university_starts_idx").on(table.universityId, table.status, table.startsAt)],
);

export const marketplaceListings = sqliteTable(
  "marketplace_listings",
  {
    id: text("id").primaryKey(),
    universityId: text("university_id").notNull().references(() => universities.id),
    ownerEmail: text("owner_email").notNull().references(() => users.email, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    category: text("category").notNull(),
    title: text("title").notNull(),
    description: text("description").notNull(),
    priceCents: integer("price_cents"),
    condition: text("condition").notNull().default("used-good"),
    meetupPlace: text("meetup_place").notNull().default(""),
    status: text("status").notNull().default("active"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("marketplace_listings_university_status_idx").on(table.universityId, table.status, table.createdAt),
    index("marketplace_listings_owner_status_idx").on(table.ownerEmail, table.status, table.createdAt),
  ],
);

// Operation receipts survive target deletion so retries cannot recreate a removed listing.
export const marketWriteRequests = sqliteTable(
  "market_write_requests",
  {
    ownerEmail: text("owner_email").notNull().references(() => users.email, { onDelete: "cascade" }),
    idempotencyKey: text("idempotency_key").notNull(),
    universityId: text("university_id").notNull().references(() => universities.id),
    action: text("action").notNull(),
    payloadHash: text("payload_hash").notNull(),
    targetId: text("target_id").notNull(),
    responseJson: text("response_json").notNull(),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    primaryKey({ columns: [table.ownerEmail, table.idempotencyKey] }),
    index("market_write_requests_target_idx").on(table.action, table.targetId),
  ],
);

export const marketMediaRequests = sqliteTable(
  "market_media_requests",
  {
    ownerEmail: text("owner_email").notNull().references(() => users.email, { onDelete: "cascade" }),
    idempotencyKey: text("idempotency_key").notNull(),
    universityId: text("university_id").notNull().references(() => universities.id),
    listingId: text("listing_id").notNull(),
    payloadHash: text("payload_hash").notNull(),
    currentAttemptId: text("current_attempt_id"),
    committedAttemptId: text("committed_attempt_id"),
    responseJson: text("response_json"),
    endedAt: text("ended_at"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [primaryKey({ columns: [table.ownerEmail, table.idempotencyKey] }), index("market_media_requests_listing_idx").on(table.listingId)],
);

export const marketMediaAttempts = sqliteTable(
  "market_media_attempts",
  {
    id: text("id").primaryKey(),
    ownerEmail: text("owner_email").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    putsSettled: integer("puts_settled").notNull().default(0),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    foreignKey({ columns: [table.ownerEmail, table.idempotencyKey], foreignColumns: [marketMediaRequests.ownerEmail, marketMediaRequests.idempotencyKey] }).onDelete("cascade"),
    index("market_media_attempts_request_idx").on(table.ownerEmail, table.idempotencyKey),
  ],
);

export const marketMediaAttemptObjects = sqliteTable(
  "market_media_attempt_objects",
  {
    imageId: text("image_id").primaryKey(),
    attemptId: text("attempt_id").notNull().references(() => marketMediaAttempts.id, { onDelete: "cascade" }),
    ordinal: integer("ordinal").notNull(),
    objectKey: text("object_key").notNull().unique(),
    cleanedAt: text("cleaned_at"),
  },
  (table) => [uniqueIndex("market_media_attempt_objects_attempt_ordinal_unique").on(table.attemptId, table.ordinal)],
);

export const marketMediaTombstones = sqliteTable(
  "market_media_tombstones",
  {
    imageId: text("image_id").primaryKey(),
    ownerEmail: text("owner_email").notNull().references(() => users.email, { onDelete: "cascade" }),
    universityId: text("university_id").notNull().references(() => universities.id),
    listingId: text("listing_id").notNull(),
    objectKey: text("object_key").notNull().unique(),
    cleanedAt: text("cleaned_at"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index("market_media_tombstones_cleanup_idx").on(table.ownerEmail, table.universityId, table.cleanedAt)],
);

export const marketplaceListingImages = sqliteTable(
  "marketplace_listing_images",
  {
    id: text("id").primaryKey(),
    listingId: text("listing_id").notNull().references(() => marketplaceListings.id, { onDelete: "cascade" }),
    uploaderEmail: text("uploader_email").notNull().references(() => users.email, { onDelete: "cascade" }),
    objectKey: text("object_key").notNull().unique(),
    originalFileName: text("original_file_name").notNull(),
    contentType: text("content_type").notNull(),
    byteSize: integer("byte_size").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("marketplace_listing_images_listing_sort_idx").on(table.listingId, table.sortOrder, table.createdAt),
  ],
);

export const marketplaceInquiries = sqliteTable(
  "marketplace_inquiries",
  {
    id: text("id").primaryKey(),
    listingId: text("listing_id").notNull().references(() => marketplaceListings.id, { onDelete: "cascade" }),
    senderEmail: text("sender_email").notNull().references(() => users.email, { onDelete: "cascade" }),
    message: text("message").notNull(),
    status: text("status").notNull().default("open"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index("marketplace_inquiries_listing_status_idx").on(table.listingId, table.status, table.createdAt)],
);

export const directConversations = sqliteTable(
  "direct_conversations",
  {
    id: text("id").primaryKey(),
    universityId: text("university_id").notNull().references(() => universities.id),
    memberOneEmail: text("member_one_email").notNull().references(() => users.email, { onDelete: "cascade" }),
    memberTwoEmail: text("member_two_email").notNull().references(() => users.email, { onDelete: "cascade" }),
    lastMessageAt: text("last_message_at"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("direct_conversations_pair_unique").on(table.memberOneEmail, table.memberTwoEmail),
    index("direct_conversations_member_one_updated_idx").on(table.memberOneEmail, table.updatedAt),
    index("direct_conversations_member_two_updated_idx").on(table.memberTwoEmail, table.updatedAt),
  ],
);

export const directMessages = sqliteTable(
  "direct_messages",
  {
    id: text("id").primaryKey(),
    conversationId: text("conversation_id").notNull().references(() => directConversations.id, { onDelete: "cascade" }),
    senderEmail: text("sender_email").notNull().references(() => users.email, { onDelete: "cascade" }),
    body: text("body").notNull().default(""),
    attachmentType: text("attachment_type"),
    attachmentId: text("attachment_id"),
    attachmentSnapshot: text("attachment_snapshot").notNull().default("{}"),
    readAt: text("read_at"),
    deletedAt: text("deleted_at"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("direct_messages_conversation_created_idx").on(table.conversationId, table.createdAt),
    index("direct_messages_conversation_read_idx").on(table.conversationId, table.readAt, table.createdAt),
    index("direct_messages_sender_created_idx").on(table.senderEmail, table.createdAt),
  ],
);

export const campusPriceReports = sqliteTable(
  "campus_price_reports",
  {
    id: text("id").primaryKey(),
    universityId: text("university_id").notNull().references(() => universities.id),
    reporterEmail: text("reporter_email").notNull().references(() => users.email, { onDelete: "cascade" }),
    placeId: text("place_id").references(() => campusPlaces.id, { onDelete: "set null" }),
    placeName: text("place_name").notNull(),
    itemName: text("item_name").notNull(),
    category: text("category").notNull(),
    priceCents: integer("price_cents").notNull(),
    observedAt: text("observed_at").notNull(),
    sourceNote: text("source_note").notNull().default(""),
    status: text("status").notNull().default("active"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("campus_price_reports_university_observed_idx").on(table.universityId, table.status, table.observedAt),
    index("campus_price_reports_place_item_idx").on(table.universityId, table.placeName, table.itemName),
  ],
);

export const posts = sqliteTable(
  "posts",
  {
    id: text("id").primaryKey(),
    authorEmail: text("author_email")
      .notNull()
      .references(() => users.email, { onDelete: "cascade" }),
    erasedUniversityId: text("erased_university_id").references(() => universities.id),
    courseId: text("course_id").references(() => courses.id),
    communityId: text("community_id"),
    content: text("content").notNull(),
    audience: text("audience", { enum: ["campus", "platform"] }).notNull().default("campus"),
    isPinned: integer("is_pinned", { mode: "boolean" }).notNull().default(false),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    deletedAt: text("deleted_at"),
  },
  (table) => [
    index("posts_created_at_idx").on(table.createdAt),
    index("posts_audience_created_idx").on(table.audience, table.createdAt, table.id),
    index("posts_author_created_idx").on(table.authorEmail, table.createdAt),
  ],
);

export const postMedia = sqliteTable(
  "post_media",
  {
    id: text("id").primaryKey(),
    postId: text("post_id").notNull().references(() => posts.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: ["image", "video"] }).notNull(),
    objectKey: text("object_key").notNull(),
    originalFileName: text("original_file_name").notNull(),
    contentType: text("content_type").notNull(),
    byteSize: integer("byte_size").notNull(),
    width: integer("width"),
    height: integer("height"),
    ordinal: integer("ordinal").notNull().default(0),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("post_media_post_kind_idx").on(table.postId, table.kind),
    index("post_media_post_order_idx").on(table.postId, table.ordinal, table.createdAt, table.id),
    uniqueIndex("post_media_object_key_unique").on(table.objectKey),
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

export const campusPulsePosts = sqliteTable(
  "campus_pulse_posts",
  {
    id: text("id").primaryKey(),
    authorEmail: text("author_email")
      .notNull()
      .references(() => users.email, { onDelete: "cascade" }),
    universityId: text("university_id")
      .notNull()
      .references(() => universities.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    category: text("category").notNull().default("general"),
    content: text("content").notNull(),
    campusZone: text("campus_zone").notNull().default(""),
    imageObjectKey: text("image_object_key"),
    imageOriginalFileName: text("image_original_file_name"),
    imageContentType: text("image_content_type"),
    imageByteSize: integer("image_byte_size"),
    isAnonymous: integer("is_anonymous", { mode: "boolean" }).notNull().default(false),
    status: text("status").notNull().default("active"),
    expiresAt: text("expires_at"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    deletedAt: text("deleted_at"),
  },
  (table) => [
    index("campus_pulse_university_kind_created_idx").on(table.universityId, table.kind, table.createdAt),
    index("campus_pulse_status_expires_idx").on(table.status, table.expiresAt),
    index("campus_pulse_author_created_idx").on(table.authorEmail, table.createdAt),
  ],
);

export const campusPulseReactions = sqliteTable(
  "campus_pulse_reactions",
  {
    postId: text("post_id")
      .notNull()
      .references(() => campusPulsePosts.id, { onDelete: "cascade" }),
    userEmail: text("user_email")
      .notNull()
      .references(() => users.email, { onDelete: "cascade" }),
    reaction: text("reaction").notNull(),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    primaryKey({ columns: [table.postId, table.userEmail] }),
    index("campus_pulse_reactions_post_idx").on(table.postId, table.reaction),
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
    erasedUniversityId: text("erased_university_id").references(() => universities.id),
    courseId: text("course_id")
      .notNull()
      .references(() => courses.id),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    noteType: text("note_type").notNull().default("ders-notu"),
    examYear: integer("exam_year"),
    examTerm: text("exam_term"),
    examKind: text("exam_kind"),
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
    index("notes_exam_course_year_idx").on(table.noteType, table.courseId, table.examYear, table.status),
    index("notes_owner_created_idx").on(table.ownerEmail, table.createdAt),
    uniqueIndex("notes_object_key_unique").on(table.objectKey).where(sql`${table.objectKey} != ''`),
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

export const noteFeedback = sqliteTable(
  "note_feedback",
  {
    noteId: text("note_id").notNull().references(() => notes.id, { onDelete: "cascade" }),
    userEmail: text("user_email").notNull().references(() => users.email, { onDelete: "cascade" }),
    value: text("value").notNull(),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    primaryKey({ columns: [table.noteId, table.userEmail] }),
    index("note_feedback_note_value_idx").on(table.noteId, table.value),
  ],
);

export const noteComments = sqliteTable(
  "note_comments",
  {
    id: text("id").primaryKey(),
    noteId: text("note_id").notNull().references(() => notes.id, { onDelete: "cascade" }),
    authorEmail: text("author_email").notNull().references(() => users.email, { onDelete: "cascade" }),
    content: text("content").notNull(),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    deletedAt: text("deleted_at"),
  },
  (table) => [
    index("note_comments_note_created_idx").on(table.noteId, table.createdAt),
    index("note_comments_author_idx").on(table.authorEmail),
  ],
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
    universityId: text("university_id").references(() => universities.id),
    courseId: text("course_id").references(() => courses.id),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    description: text("description").notNull().default(""),
    category: text("category").notNull().default("ilgi"),
    joinPolicy: text("join_policy").notNull().default("open"),
    rules: text("rules").notNull().default(""),
    status: text("status").notNull().default("active"),
    moderationStatus: text("moderation_status").notNull().default("active"),
    lastActivityAt: text("last_activity_at"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    archivedAt: text("archived_at"),
  },
  (table) => [
    uniqueIndex("communities_slug_unique").on(table.slug),
    index("communities_status_created_idx").on(table.status, table.createdAt),
    index("communities_university_status_activity_idx").on(table.universityId, table.moderationStatus, table.status, table.lastActivityAt),
  ],
);

export const communityMembers = sqliteTable(
  "community_members",
  {
    communityId: text("community_id").notNull().references(() => communities.id, { onDelete: "cascade" }),
    userEmail: text("user_email").notNull().references(() => users.email, { onDelete: "cascade" }),
    role: text("role").notNull().default("member"),
    status: text("status").notNull().default("active"),
    notificationLevel: text("notification_level").notNull().default("all"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    primaryKey({ columns: [table.communityId, table.userEmail] }),
    index("community_members_user_status_idx").on(table.userEmail, table.status),
  ],
);

export const communityPostMeta = sqliteTable(
  "community_post_meta",
  {
    postId: text("post_id").primaryKey().references(() => posts.id, { onDelete: "cascade" }),
    postType: text("post_type").notNull().default("discussion"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index("community_post_meta_type_idx").on(table.postType)],
);

export const communityBans = sqliteTable(
  "community_bans",
  {
    communityId: text("community_id").notNull().references(() => communities.id, { onDelete: "cascade" }),
    userEmail: text("user_email").notNull().references(() => users.email, { onDelete: "cascade" }),
    bannedByEmail: text("banned_by_email").notNull().references(() => users.email, { onDelete: "cascade" }),
    reason: text("reason").notNull().default(""),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    primaryKey({ columns: [table.communityId, table.userEmail] }),
    index("community_bans_actor_idx").on(table.bannedByEmail, table.createdAt),
  ],
);

export const communityEvents = sqliteTable(
  "community_events",
  {
    id: text("id").primaryKey(),
    communityId: text("community_id").notNull().references(() => communities.id, { onDelete: "cascade" }),
    creatorEmail: text("creator_email").notNull().references(() => users.email, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    location: text("location").notNull().default(""),
    startsAt: text("starts_at").notNull(),
    endsAt: text("ends_at"),
    capacity: integer("capacity"),
    status: text("status").notNull().default("active"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index("community_events_community_starts_idx").on(table.communityId, table.status, table.startsAt)],
);

export const communityEventAttendees = sqliteTable(
  "community_event_attendees",
  {
    eventId: text("event_id").notNull().references(() => communityEvents.id, { onDelete: "cascade" }),
    userEmail: text("user_email").notNull().references(() => users.email, { onDelete: "cascade" }),
    status: text("status").notNull().default("going"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    primaryKey({ columns: [table.eventId, table.userEmail] }),
    index("community_event_attendees_user_idx").on(table.userEmail, table.status, table.createdAt),
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

export const pushSubscriptions = sqliteTable("push_subscriptions", {
  id: text("id").primaryKey(),
  ownerEmail: text("owner_email").notNull().references(() => users.email, { onDelete: "cascade" }),
  sessionHash: text("session_hash").notNull().references(() => userSessions.tokenHash, { onDelete: "cascade" }),
  deviceId: text("device_id").notNull(),
  kind: text("kind").notNull(),
  endpointHash: text("endpoint_hash").notNull().unique(),
  endpoint: text("endpoint"),
  p256dh: text("p256dh"),
  auth: text("auth"),
  token: text("token"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("push_subscriptions_owner_session_device_unique").on(table.ownerEmail, table.sessionHash, table.deviceId),
  index("push_subscriptions_owner_session_idx").on(table.ownerEmail, table.sessionHash),
]);

export const pushDeviceRevocations = sqliteTable("push_device_revocations", {
  sessionHash: text("session_hash").notNull().references(() => userSessions.tokenHash, { onDelete: "cascade" }),
  deviceId: text("device_id").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [primaryKey({ columns: [table.sessionHash, table.deviceId] })]);

export const pushDeliveries = sqliteTable("push_deliveries", {
  id: text("id").primaryKey(),
  notificationId: text("notification_id").notNull().references(() => notifications.id, { onDelete: "cascade" }),
  subscriptionId: text("subscription_id").notNull().references(() => pushSubscriptions.id, { onDelete: "cascade" }),
  state: text("state").notNull().default("pending"),
  attempts: integer("attempts").notNull().default(0),
  nextAttemptMs: integer("next_attempt_ms").notNull().default(sql`(unixepoch() * 1000)`),
  expiresMs: integer("expires_ms").notNull().default(sql`((unixepoch() + 86400) * 1000)`),
  leaseToken: text("lease_token"),
  leaseUntilMs: integer("lease_until_ms"),
  lastStatus: integer("last_status"),
  finishedMs: integer("finished_ms"),
}, (table) => [
  uniqueIndex("push_deliveries_notification_subscription_unique").on(table.notificationId, table.subscriptionId),
  index("push_deliveries_due_idx").on(table.state, table.nextAttemptMs, table.leaseUntilMs),
]);

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

export const staffAccounts = sqliteTable(
  "staff_accounts",
  {
    id: text("id").primaryKey(),
    username: text("username").notNull(),
    displayName: text("display_name").notNull(),
    role: text("role").notNull(),
    passwordHash: text("password_hash").notNull(),
    passwordSalt: text("password_salt").notNull(),
    passwordIterations: integer("password_iterations").notNull(),
    status: text("status").notNull().default("active"),
    mustChangePassword: integer("must_change_password", { mode: "boolean" }).notNull().default(true),
    createdByStaffId: text("created_by_staff_id"),
    lastLoginAt: text("last_login_at"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("staff_accounts_username_unique").on(table.username),
    index("staff_accounts_role_status_idx").on(table.role, table.status),
  ],
);

export const staffSessions = sqliteTable(
  "staff_sessions",
  {
    tokenHash: text("token_hash").primaryKey(),
    staffId: text("staff_id").notNull().references(() => staffAccounts.id, { onDelete: "cascade" }),
    expiresAt: text("expires_at").notNull(),
    lastSeenAt: text("last_seen_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("staff_sessions_staff_expiry_idx").on(table.staffId, table.expiresAt),
    index("staff_sessions_expiry_idx").on(table.expiresAt),
  ],
);

export const platformSettings = sqliteTable("platform_settings", {
  key: text("key").primaryKey(),
  valueJson: text("value_json").notNull(),
  updatedByStaffId: text("updated_by_staff_id").references(() => staffAccounts.id, { onDelete: "set null" }),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const staffAuditLogs = sqliteTable(
  "staff_audit_logs",
  {
    id: text("id").primaryKey(),
    staffId: text("staff_id").references(() => staffAccounts.id, { onDelete: "set null" }),
    action: text("action").notNull(),
    entityType: text("entity_type"),
    entityId: text("entity_id"),
    detail: text("detail").notNull().default("{}"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("staff_audit_staff_created_idx").on(table.staffId, table.createdAt),
    index("staff_audit_action_created_idx").on(table.action, table.createdAt),
  ],
);

export const accountErasureJobs = sqliteTable("account_erasure_jobs", {
  id: text("id").primaryKey(), sourceRequestId: text("source_request_id").notNull().unique(),
  state: text("state").notNull().default("queued"), leaseToken: text("lease_token"), leaseUntilMs: integer("lease_until_ms"),
  attempts: integer("attempts").notNull().default(0), removedObjectCount: integer("removed_object_count").notNull().default(0),
  removedRowCount: integer("removed_row_count").notNull().default(0), preservedContainerCount: integer("preserved_container_count").notNull().default(0),
  lastErrorCode: text("last_error_code"), createdAt: text("created_at").notNull(), updatedAt: text("updated_at").notNull(), completedAt: text("completed_at"),
});
export const accountErasureSubjects = sqliteTable("account_erasure_subjects", {
  jobId: text("job_id").primaryKey().references(() => accountErasureJobs.id, { onDelete: "cascade" }),
  userEmail: text("user_email").notNull().unique(), tombstoneEmail: text("tombstone_email").notNull().unique(),
  scanCursor: text("scan_cursor"), scanComplete: integer("scan_complete").notNull().default(0),
  scrubTable: integer("scrub_table").notNull().default(0), scrubCursor: text("scrub_cursor"), scrubComplete: integer("scrub_complete").notNull().default(0),
});
export const accountErasureObjects = sqliteTable("account_erasure_objects", {
  jobId: text("job_id").notNull().references(() => accountErasureJobs.id, { onDelete: "cascade" }),
  objectKey: text("object_key").notNull(), kind: text("kind").notNull(), state: text("state").notNull(), evidenceKind: text("evidence_kind").notNull(),
  attempts: integer("attempts").notNull().default(0), lastErrorCode: text("last_error_code"), deletedAt: text("deleted_at"),
}, table => [primaryKey({ columns: [table.jobId, table.objectKey] }), index("account_erasure_objects_pending_idx").on(table.jobId, table.state)]);
export const accountErasureEntities = sqliteTable("account_erasure_entities", {
  jobId: text("job_id").notNull().references(() => accountErasureJobs.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(), entityId: text("entity_id").notNull(),
}, table => [primaryKey({ columns: [table.jobId, table.kind, table.entityId] })]);
export const mediaUploadOperations = sqliteTable("media_upload_operations", {
  id: text("id").primaryKey(), ownerEmail: text("owner_email").notNull(), objectKey: text("object_key").notNull().unique(),
  ownerPublicId: text("owner_public_id").notNull(),
  kind: text("kind").notNull(), state: text("state").notNull().default("putting"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`), settledAt: text("settled_at"),
}, table => [index("media_upload_operations_owner_state_idx").on(table.ownerEmail, table.state)]);

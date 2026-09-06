/** Explicit ownership inventory. New user-bound tables must extend this list and its coverage test. */
export const ERASURE_USER_RELATIONS = [
  ["account_deletion_requests", "user_email"], ["campus_events", "creator_email"],
  ["campus_place_confirmations", "user_email"], ["campus_places", "creator_email"],
  ["campus_price_reports", "reporter_email"], ["campus_pulse_posts", "author_email"],
  ["campus_pulse_reactions", "user_email"], ["communities", "creator_email"],
  ["community_audit_logs", "actor_email"], ["community_bans", "banned_by_email", "user_email"],
  ["community_event_attendees", "user_email"], ["community_events", "creator_email"],
  ["community_members", "user_email"], ["content_reports", "decided_by_email", "reporter_email"],
  ["direct_conversations", "member_two_email", "member_one_email"], ["direct_messages", "sender_email"],
  ["housing_discussions", "author_email"], ["library_areas", "creator_email"], ["library_checkins", "user_email"],
  ["market_media_requests", "owner_email"], ["market_media_tombstones", "owner_email"], ["market_write_requests", "owner_email"],
  ["marketplace_inquiries", "sender_email"], ["marketplace_listing_images", "uploader_email"], ["marketplace_listings", "owner_email"],
  ["meetup_requests", "recipient_email", "sender_email"], ["note_comments", "author_email"], ["note_feedback", "user_email"],
  ["note_saves", "user_email"], ["note_views", "user_email"], ["notes", "owner_email"],
  ["notification_preferences", "user_email"], ["notifications", "actor_email", "user_email"],
  ["pilot_invites", "claimed_by_email", "created_by_email"], ["platform_roles", "user_email"],
  ["post_comments", "author_email"], ["post_likes", "user_email"], ["post_publish_requests", "author_email"],
  ["post_saves", "user_email"], ["posts", "author_email"], ["product_events", "user_email"], ["product_feedback", "user_email"],
  ["profile_media", "user_email"], ["push_subscriptions", "owner_email"], ["student_courses", "user_email"],
  ["student_profiles", "user_email"], ["student_social_profiles", "user_email"], ["user_blocks", "blocked_email", "blocker_email"],
  ["user_credentials", "user_email"], ["user_follows", "following_email", "follower_email"],
  ["user_mutes", "muted_email", "muter_email"], ["user_sessions", "user_email"],
] as const;

export const ERASURE_ENTITY_SOURCES = [
  ["post", "posts", "author_email"], ["comment", "post_comments", "author_email"],
  ["note", "notes", "owner_email"], ["note-comment", "note_comments", "author_email"],
  ["listing", "marketplace_listings", "owner_email"], ["inquiry", "marketplace_inquiries", "sender_email"],
  ["pulse", "campus_pulse_posts", "author_email"], ["community", "communities", "creator_email"],
  ["community-event", "community_events", "creator_email"], ["event", "campus_events", "creator_email"],
  ["place", "campus_places", "creator_email"], ["library-area", "library_areas", "creator_email"],
  ["housing-message", "housing_discussions", "author_email"], ["message", "direct_messages", "sender_email"],
  ["meetup", "meetup_requests", "sender_email"], ["price", "campus_price_reports", "reporter_email"],
] as const;

/** All SELECTs take the original email once; source manifests remain until completion. */
export const ERASURE_OBJECT_SOURCES = [
  ["notes", "metadata", "SELECT object_key FROM notes WHERE owner_email = ?"],
  ["profile", "metadata", "SELECT object_key FROM profile_media WHERE user_email = ?"],
  ["pulse", "metadata", "SELECT image_object_key AS object_key FROM campus_pulse_posts WHERE author_email = ? AND image_object_key IS NOT NULL"],
  ["post", "metadata", "SELECT m.object_key FROM post_media m JOIN posts p ON p.id=m.post_id WHERE p.author_email = ?"],
  ["post", "post_attempt", "SELECT a.object_key FROM post_publish_attempts a JOIN post_publish_requests r ON r.id=a.request_id WHERE r.author_email = ? AND a.object_key IS NOT NULL"],
  ["post", "post_attempt", "SELECT m.object_key FROM post_publish_attempt_media m JOIN post_publish_attempts a ON a.id=m.attempt_id JOIN post_publish_requests r ON r.id=a.request_id WHERE r.author_email = ?"],
  ["market", "metadata", "SELECT object_key FROM marketplace_listing_images WHERE uploader_email = ?"],
  ["market", "metadata", "SELECT m.object_key FROM marketplace_listing_images m JOIN marketplace_listings l ON l.id=m.listing_id WHERE l.owner_email = ?"],
  ["market", "market_attempt", "SELECT m.object_key FROM market_media_attempt_objects m JOIN market_media_attempts a ON a.id=m.attempt_id WHERE a.owner_email = ?"],
  ["market", "metadata", "SELECT object_key FROM market_media_tombstones WHERE owner_email = ?"],
  ["tracked", "upload_operation", "SELECT object_key FROM media_upload_operations WHERE owner_email = ?"],
] as const;

// Runs at acceptance AND at every resume before source records can be removed.
export function snapshotErasureObjects(db: D1Database, jobId: string, email: string) {
  return ERASURE_OBJECT_SOURCES.map(([kind, evidence, select]) => db.prepare(
    `INSERT INTO account_erasure_objects(job_id,object_key,kind,state,evidence_kind)
     SELECT ?, source.object_key, ?, 'waiting_put', ? FROM (${select}) source
     WHERE source.object_key != '' AND EXISTS(SELECT 1 FROM account_erasure_subjects WHERE job_id=? AND user_email=?)
     ON CONFLICT(job_id,object_key) DO NOTHING`,
  ).bind(jobId, kind, evidence, email, jobId, email));
}

export const ERASURE_PRESERVATIONS = [
  ["posts", "author_email", "content='Bu paylaşım silindi.', is_pinned=0, deleted_at=NULL, erased_university_id=(SELECT university_id FROM student_profiles WHERE user_email=posts.author_email)"],
  ["notes", "owner_email", "title='Silinen not', description='', object_key='', original_file_name='', content_type='application/octet-stream', byte_size=0, page_count=NULL, tags_json='[]', exam_year=NULL, exam_term=NULL, exam_kind=NULL, rejection_reason=NULL, status='rejected', deleted_at=NULL, erased_university_id=(SELECT university_id FROM student_profiles WHERE user_email=notes.owner_email)"],
  ["marketplace_listings", "owner_email", "title='Silinmiş ilan', description='', price_cents=NULL, meetup_place='', status='closed'"],
  ["communities", "creator_email", "name='Silinmiş topluluk', slug='erased-' || id, description='', rules=''"],
  ["community_events", "creator_email", "title='Silinmiş etkinlik', description='', location='', status='cancelled'"],
  ["campus_events", "creator_email", "title='Silinmiş etkinlik', description='', status='cancelled'"],
  ["campus_places", "creator_email", "name='Silinmiş yer', description='', address='', latitude=NULL, longitude=NULL, opening_hours='', accessibility_json='[]'"],
  ["library_areas", "creator_email", "name='Silinmiş alan', description='', floor_label='', zone_label='', features_json='[]'"],
  ["community_bans", "banned_by_email", "reason=''"],
] as const;

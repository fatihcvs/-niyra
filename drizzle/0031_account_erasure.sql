ALTER TABLE posts ADD COLUMN erased_university_id TEXT REFERENCES universities(id);
ALTER TABLE notes ADD COLUMN erased_university_id TEXT REFERENCES universities(id);
DROP INDEX notes_object_key_unique;
CREATE UNIQUE INDEX notes_object_key_unique ON notes(object_key) WHERE object_key!='';
-- Independent erasure receipts survive removal of the original user and request.
CREATE TABLE account_erasure_jobs (
 id TEXT PRIMARY KEY NOT NULL,
 source_request_id TEXT NOT NULL UNIQUE,
 state TEXT NOT NULL DEFAULT 'queued' CHECK(state IN ('queued','storage_pending','blocked','finalizing','completed')),
 lease_token TEXT, lease_until_ms INTEGER,
 attempts INTEGER NOT NULL DEFAULT 0,
 removed_object_count INTEGER NOT NULL DEFAULT 0,
 removed_row_count INTEGER NOT NULL DEFAULT 0,
 preserved_container_count INTEGER NOT NULL DEFAULT 0,
 last_error_code TEXT,
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL, completed_at TEXT
);
CREATE TABLE account_erasure_subjects (
 job_id TEXT PRIMARY KEY NOT NULL REFERENCES account_erasure_jobs(id) ON DELETE CASCADE,
 user_email TEXT NOT NULL UNIQUE,
 tombstone_email TEXT NOT NULL UNIQUE,
 scan_cursor TEXT,
 scan_complete INTEGER NOT NULL DEFAULT 0 CHECK(scan_complete IN (0,1)),
 scrub_table INTEGER NOT NULL DEFAULT 0,
 scrub_cursor TEXT,
 scrub_complete INTEGER NOT NULL DEFAULT 0 CHECK(scrub_complete IN (0,1))
);
CREATE TABLE account_erasure_objects (
 job_id TEXT NOT NULL REFERENCES account_erasure_jobs(id) ON DELETE CASCADE,
 object_key TEXT NOT NULL,
 kind TEXT NOT NULL,
 state TEXT NOT NULL CHECK(state IN ('waiting_put','delete_pending','deleted','blocked')),
 evidence_kind TEXT NOT NULL,
 attempts INTEGER NOT NULL DEFAULT 0,
 last_error_code TEXT,
 deleted_at TEXT,
 PRIMARY KEY(job_id,object_key)
);
CREATE INDEX account_erasure_objects_pending_idx ON account_erasure_objects(job_id,state);
CREATE TABLE account_erasure_entities (
 job_id TEXT NOT NULL REFERENCES account_erasure_jobs(id) ON DELETE CASCADE,
 kind TEXT NOT NULL, entity_id TEXT NOT NULL,
 PRIMARY KEY(job_id,kind,entity_id)
);
-- Erasure may delete the row, but a paused moderation/profile update cannot reactivate it.
CREATE TRIGGER account_erasure_user_update BEFORE UPDATE ON users
WHEN OLD.status IN ('deleting','deleted')
BEGIN SELECT RAISE(ABORT,'ACCOUNT_ERASURE_FROZEN'); END;

CREATE TRIGGER erasure_account_deletion_requests_insert BEFORE INSERT ON account_deletion_requests
WHEN (NEW.user_email IS NOT NULL AND EXISTS (SELECT 1 FROM users WHERE email=NEW.user_email AND status IN ('deleting','deleted')))
BEGIN SELECT RAISE(ABORT,'ACCOUNT_ERASURE_FROZEN'); END;
CREATE TRIGGER erasure_account_deletion_requests_update BEFORE UPDATE ON account_deletion_requests
WHEN ((NEW.user_email IS NOT NULL AND (EXISTS (SELECT 1 FROM users WHERE email=NEW.user_email AND status='deleting') OR
   (EXISTS (SELECT 1 FROM users WHERE email=NEW.user_email AND status='deleted')

    AND NOT EXISTS (SELECT 1 FROM account_erasure_subjects s JOIN account_erasure_jobs j ON j.id=s.job_id
      WHERE s.user_email=OLD.user_email AND s.tombstone_email=NEW.user_email AND j.state='finalizing'))))) AND NOT (0 OR 0)
BEGIN SELECT RAISE(ABORT,'ACCOUNT_ERASURE_FROZEN'); END;

CREATE TRIGGER erasure_campus_events_insert BEFORE INSERT ON campus_events
WHEN (NEW.creator_email IS NOT NULL AND EXISTS (SELECT 1 FROM users WHERE email=NEW.creator_email AND status IN ('deleting','deleted')))
BEGIN SELECT RAISE(ABORT,'ACCOUNT_ERASURE_FROZEN'); END;
CREATE TRIGGER erasure_campus_events_update BEFORE UPDATE ON campus_events
WHEN ((NEW.creator_email IS NOT NULL AND (EXISTS (SELECT 1 FROM users WHERE email=NEW.creator_email AND status='deleting') OR
   (EXISTS (SELECT 1 FROM users WHERE email=NEW.creator_email AND status='deleted')
    AND NEW.creator_email IS NOT OLD.creator_email
    AND NOT EXISTS (SELECT 1 FROM account_erasure_subjects s JOIN account_erasure_jobs j ON j.id=s.job_id
      WHERE s.user_email=OLD.creator_email AND s.tombstone_email=NEW.creator_email AND j.state='finalizing'))))) AND NOT (0 OR 0)
BEGIN SELECT RAISE(ABORT,'ACCOUNT_ERASURE_FROZEN'); END;

CREATE TRIGGER erasure_campus_place_confirmations_insert BEFORE INSERT ON campus_place_confirmations
WHEN (NEW.user_email IS NOT NULL AND EXISTS (SELECT 1 FROM users WHERE email=NEW.user_email AND status IN ('deleting','deleted')))
BEGIN SELECT RAISE(ABORT,'ACCOUNT_ERASURE_FROZEN'); END;
CREATE TRIGGER erasure_campus_place_confirmations_update BEFORE UPDATE ON campus_place_confirmations
WHEN ((NEW.user_email IS NOT NULL AND (EXISTS (SELECT 1 FROM users WHERE email=NEW.user_email AND status='deleting') OR
   (EXISTS (SELECT 1 FROM users WHERE email=NEW.user_email AND status='deleted')

    AND NOT EXISTS (SELECT 1 FROM account_erasure_subjects s JOIN account_erasure_jobs j ON j.id=s.job_id
      WHERE s.user_email=OLD.user_email AND s.tombstone_email=NEW.user_email AND j.state='finalizing'))))) AND NOT (0 OR 0)
BEGIN SELECT RAISE(ABORT,'ACCOUNT_ERASURE_FROZEN'); END;

CREATE TRIGGER erasure_campus_places_insert BEFORE INSERT ON campus_places
WHEN (NEW.creator_email IS NOT NULL AND EXISTS (SELECT 1 FROM users WHERE email=NEW.creator_email AND status IN ('deleting','deleted')))
BEGIN SELECT RAISE(ABORT,'ACCOUNT_ERASURE_FROZEN'); END;
CREATE TRIGGER erasure_campus_places_update BEFORE UPDATE ON campus_places
WHEN ((NEW.creator_email IS NOT NULL AND (EXISTS (SELECT 1 FROM users WHERE email=NEW.creator_email AND status='deleting') OR
   (EXISTS (SELECT 1 FROM users WHERE email=NEW.creator_email AND status='deleted')
    AND NEW.creator_email IS NOT OLD.creator_email
    AND NOT EXISTS (SELECT 1 FROM account_erasure_subjects s JOIN account_erasure_jobs j ON j.id=s.job_id
      WHERE s.user_email=OLD.creator_email AND s.tombstone_email=NEW.creator_email AND j.state='finalizing'))))) AND NOT (0 OR 0)
BEGIN SELECT RAISE(ABORT,'ACCOUNT_ERASURE_FROZEN'); END;

CREATE TRIGGER erasure_campus_price_reports_insert BEFORE INSERT ON campus_price_reports
WHEN (NEW.reporter_email IS NOT NULL AND EXISTS (SELECT 1 FROM users WHERE email=NEW.reporter_email AND status IN ('deleting','deleted')))
BEGIN SELECT RAISE(ABORT,'ACCOUNT_ERASURE_FROZEN'); END;
CREATE TRIGGER erasure_campus_price_reports_update BEFORE UPDATE ON campus_price_reports
WHEN ((NEW.reporter_email IS NOT NULL AND (EXISTS (SELECT 1 FROM users WHERE email=NEW.reporter_email AND status='deleting') OR
   (EXISTS (SELECT 1 FROM users WHERE email=NEW.reporter_email AND status='deleted')

    AND NOT EXISTS (SELECT 1 FROM account_erasure_subjects s JOIN account_erasure_jobs j ON j.id=s.job_id
      WHERE s.user_email=OLD.reporter_email AND s.tombstone_email=NEW.reporter_email AND j.state='finalizing'))))) AND NOT (0 OR 0)
BEGIN SELECT RAISE(ABORT,'ACCOUNT_ERASURE_FROZEN'); END;

CREATE TRIGGER erasure_campus_pulse_posts_insert BEFORE INSERT ON campus_pulse_posts
WHEN (NEW.author_email IS NOT NULL AND EXISTS (SELECT 1 FROM users WHERE email=NEW.author_email AND status IN ('deleting','deleted')))
BEGIN SELECT RAISE(ABORT,'ACCOUNT_ERASURE_FROZEN'); END;
CREATE TRIGGER erasure_campus_pulse_posts_update BEFORE UPDATE ON campus_pulse_posts
WHEN ((NEW.author_email IS NOT NULL AND (EXISTS (SELECT 1 FROM users WHERE email=NEW.author_email AND status='deleting') OR
   (EXISTS (SELECT 1 FROM users WHERE email=NEW.author_email AND status='deleted')

    AND NOT EXISTS (SELECT 1 FROM account_erasure_subjects s JOIN account_erasure_jobs j ON j.id=s.job_id
      WHERE s.user_email=OLD.author_email AND s.tombstone_email=NEW.author_email AND j.state='finalizing'))))) AND NOT (0 OR 0)
BEGIN SELECT RAISE(ABORT,'ACCOUNT_ERASURE_FROZEN'); END;

CREATE TRIGGER erasure_campus_pulse_reactions_insert BEFORE INSERT ON campus_pulse_reactions
WHEN (NEW.user_email IS NOT NULL AND EXISTS (SELECT 1 FROM users WHERE email=NEW.user_email AND status IN ('deleting','deleted')))
BEGIN SELECT RAISE(ABORT,'ACCOUNT_ERASURE_FROZEN'); END;
CREATE TRIGGER erasure_campus_pulse_reactions_update BEFORE UPDATE ON campus_pulse_reactions
WHEN ((NEW.user_email IS NOT NULL AND (EXISTS (SELECT 1 FROM users WHERE email=NEW.user_email AND status='deleting') OR
   (EXISTS (SELECT 1 FROM users WHERE email=NEW.user_email AND status='deleted')

    AND NOT EXISTS (SELECT 1 FROM account_erasure_subjects s JOIN account_erasure_jobs j ON j.id=s.job_id
      WHERE s.user_email=OLD.user_email AND s.tombstone_email=NEW.user_email AND j.state='finalizing'))))) AND NOT (0 OR 0)
BEGIN SELECT RAISE(ABORT,'ACCOUNT_ERASURE_FROZEN'); END;

CREATE TRIGGER erasure_communities_insert BEFORE INSERT ON communities
WHEN (NEW.creator_email IS NOT NULL AND EXISTS (SELECT 1 FROM users WHERE email=NEW.creator_email AND status IN ('deleting','deleted')))
BEGIN SELECT RAISE(ABORT,'ACCOUNT_ERASURE_FROZEN'); END;
CREATE TRIGGER erasure_communities_update BEFORE UPDATE ON communities
WHEN ((NEW.creator_email IS NOT NULL AND (EXISTS (SELECT 1 FROM users WHERE email=NEW.creator_email AND status='deleting') OR
   (EXISTS (SELECT 1 FROM users WHERE email=NEW.creator_email AND status='deleted')
    AND NEW.creator_email IS NOT OLD.creator_email
    AND NOT EXISTS (SELECT 1 FROM account_erasure_subjects s JOIN account_erasure_jobs j ON j.id=s.job_id
      WHERE s.user_email=OLD.creator_email AND s.tombstone_email=NEW.creator_email AND j.state='finalizing'))))) AND NOT (0 OR 0)
BEGIN SELECT RAISE(ABORT,'ACCOUNT_ERASURE_FROZEN'); END;

CREATE TRIGGER erasure_community_audit_logs_insert BEFORE INSERT ON community_audit_logs
WHEN (NEW.actor_email IS NOT NULL AND EXISTS (SELECT 1 FROM users WHERE email=NEW.actor_email AND status IN ('deleting','deleted')))
BEGIN SELECT RAISE(ABORT,'ACCOUNT_ERASURE_FROZEN'); END;
CREATE TRIGGER erasure_community_audit_logs_update BEFORE UPDATE ON community_audit_logs
WHEN ((NEW.actor_email IS NOT NULL AND (EXISTS (SELECT 1 FROM users WHERE email=NEW.actor_email AND status='deleting') OR
   (EXISTS (SELECT 1 FROM users WHERE email=NEW.actor_email AND status='deleted')

    AND NOT EXISTS (SELECT 1 FROM account_erasure_subjects s JOIN account_erasure_jobs j ON j.id=s.job_id
      WHERE s.user_email=OLD.actor_email AND s.tombstone_email=NEW.actor_email AND j.state='finalizing'))))) AND NOT ((EXISTS(SELECT 1 FROM account_erasure_subjects s JOIN account_erasure_jobs j ON j.id=s.job_id WHERE s.user_email IN(OLD.actor_email) AND j.state!='completed') AND (NEW.target_email IS NOT OLD.target_email OR NEW.detail IS NOT OLD.detail) AND NEW.id IS OLD.id AND NEW.community_id IS OLD.community_id AND NEW.actor_email IS OLD.actor_email AND NEW.action IS OLD.action AND NEW.created_at IS OLD.created_at AND (NEW.target_email IS OLD.target_email OR NEW.target_email IS NULL) AND (NEW.detail IS OLD.detail OR NEW.detail IS '{}')) OR 0)
BEGIN SELECT RAISE(ABORT,'ACCOUNT_ERASURE_FROZEN'); END;

CREATE TRIGGER erasure_community_bans_insert BEFORE INSERT ON community_bans
WHEN (NEW.banned_by_email IS NOT NULL AND EXISTS (SELECT 1 FROM users WHERE email=NEW.banned_by_email AND status IN ('deleting','deleted'))) OR (NEW.user_email IS NOT NULL AND EXISTS (SELECT 1 FROM users WHERE email=NEW.user_email AND status IN ('deleting','deleted')))
BEGIN SELECT RAISE(ABORT,'ACCOUNT_ERASURE_FROZEN'); END;
CREATE TRIGGER erasure_community_bans_update BEFORE UPDATE ON community_bans
WHEN ((NEW.banned_by_email IS NOT NULL AND (EXISTS (SELECT 1 FROM users WHERE email=NEW.banned_by_email AND status='deleting') OR
   (EXISTS (SELECT 1 FROM users WHERE email=NEW.banned_by_email AND status='deleted')
    AND NEW.banned_by_email IS NOT OLD.banned_by_email
    AND NOT EXISTS (SELECT 1 FROM account_erasure_subjects s JOIN account_erasure_jobs j ON j.id=s.job_id
      WHERE s.user_email=OLD.banned_by_email AND s.tombstone_email=NEW.banned_by_email AND j.state='finalizing')))) OR (NEW.user_email IS NOT NULL AND (EXISTS (SELECT 1 FROM users WHERE email=NEW.user_email AND status='deleting') OR
   (EXISTS (SELECT 1 FROM users WHERE email=NEW.user_email AND status='deleted')
    AND NEW.user_email IS NOT OLD.user_email
    AND NOT EXISTS (SELECT 1 FROM account_erasure_subjects s JOIN account_erasure_jobs j ON j.id=s.job_id
      WHERE s.user_email=OLD.user_email AND s.tombstone_email=NEW.user_email AND j.state='finalizing'))))) AND NOT (0 OR (NEW.community_id IS OLD.community_id AND NEW.user_email IS OLD.user_email AND NEW.created_at IS OLD.created_at AND EXISTS(SELECT 1 FROM account_erasure_subjects s JOIN account_erasure_jobs j ON j.id=s.job_id WHERE j.state='finalizing' AND j.lease_token IS NOT NULL AND s.user_email=OLD.banned_by_email AND NEW.banned_by_email=s.tombstone_email AND (NEW.reason IS OLD.reason OR NEW.reason=''))))
BEGIN SELECT RAISE(ABORT,'ACCOUNT_ERASURE_FROZEN'); END;

CREATE TRIGGER erasure_community_event_attendees_insert BEFORE INSERT ON community_event_attendees
WHEN (NEW.user_email IS NOT NULL AND EXISTS (SELECT 1 FROM users WHERE email=NEW.user_email AND status IN ('deleting','deleted')))
BEGIN SELECT RAISE(ABORT,'ACCOUNT_ERASURE_FROZEN'); END;
CREATE TRIGGER erasure_community_event_attendees_update BEFORE UPDATE ON community_event_attendees
WHEN ((NEW.user_email IS NOT NULL AND (EXISTS (SELECT 1 FROM users WHERE email=NEW.user_email AND status='deleting') OR
   (EXISTS (SELECT 1 FROM users WHERE email=NEW.user_email AND status='deleted')

    AND NOT EXISTS (SELECT 1 FROM account_erasure_subjects s JOIN account_erasure_jobs j ON j.id=s.job_id
      WHERE s.user_email=OLD.user_email AND s.tombstone_email=NEW.user_email AND j.state='finalizing'))))) AND NOT (0 OR 0)
BEGIN SELECT RAISE(ABORT,'ACCOUNT_ERASURE_FROZEN'); END;

CREATE TRIGGER erasure_community_events_insert BEFORE INSERT ON community_events
WHEN (NEW.creator_email IS NOT NULL AND EXISTS (SELECT 1 FROM users WHERE email=NEW.creator_email AND status IN ('deleting','deleted')))
BEGIN SELECT RAISE(ABORT,'ACCOUNT_ERASURE_FROZEN'); END;
CREATE TRIGGER erasure_community_events_update BEFORE UPDATE ON community_events
WHEN ((NEW.creator_email IS NOT NULL AND (EXISTS (SELECT 1 FROM users WHERE email=NEW.creator_email AND status='deleting') OR
   (EXISTS (SELECT 1 FROM users WHERE email=NEW.creator_email AND status='deleted')
    AND NEW.creator_email IS NOT OLD.creator_email
    AND NOT EXISTS (SELECT 1 FROM account_erasure_subjects s JOIN account_erasure_jobs j ON j.id=s.job_id
      WHERE s.user_email=OLD.creator_email AND s.tombstone_email=NEW.creator_email AND j.state='finalizing'))))) AND NOT (0 OR 0)
BEGIN SELECT RAISE(ABORT,'ACCOUNT_ERASURE_FROZEN'); END;

CREATE TRIGGER erasure_community_members_insert BEFORE INSERT ON community_members
WHEN (NEW.user_email IS NOT NULL AND EXISTS (SELECT 1 FROM users WHERE email=NEW.user_email AND status IN ('deleting','deleted')))
BEGIN SELECT RAISE(ABORT,'ACCOUNT_ERASURE_FROZEN'); END;
CREATE TRIGGER erasure_community_members_update BEFORE UPDATE ON community_members
WHEN ((NEW.user_email IS NOT NULL AND (EXISTS (SELECT 1 FROM users WHERE email=NEW.user_email AND status='deleting') OR
   (EXISTS (SELECT 1 FROM users WHERE email=NEW.user_email AND status='deleted')

    AND NOT EXISTS (SELECT 1 FROM account_erasure_subjects s JOIN account_erasure_jobs j ON j.id=s.job_id
      WHERE s.user_email=OLD.user_email AND s.tombstone_email=NEW.user_email AND j.state='finalizing'))))) AND NOT (0 OR 0)
BEGIN SELECT RAISE(ABORT,'ACCOUNT_ERASURE_FROZEN'); END;

CREATE TRIGGER erasure_content_reports_insert BEFORE INSERT ON content_reports
WHEN (NEW.decided_by_email IS NOT NULL AND EXISTS (SELECT 1 FROM users WHERE email=NEW.decided_by_email AND status IN ('deleting','deleted'))) OR (NEW.reporter_email IS NOT NULL AND EXISTS (SELECT 1 FROM users WHERE email=NEW.reporter_email AND status IN ('deleting','deleted')))
BEGIN SELECT RAISE(ABORT,'ACCOUNT_ERASURE_FROZEN'); END;
CREATE TRIGGER erasure_content_reports_update BEFORE UPDATE ON content_reports
WHEN ((NEW.decided_by_email IS NOT NULL AND (EXISTS (SELECT 1 FROM users WHERE email=NEW.decided_by_email AND status='deleting') OR
   (EXISTS (SELECT 1 FROM users WHERE email=NEW.decided_by_email AND status='deleted')

    AND NOT EXISTS (SELECT 1 FROM account_erasure_subjects s JOIN account_erasure_jobs j ON j.id=s.job_id
      WHERE s.user_email=OLD.decided_by_email AND s.tombstone_email=NEW.decided_by_email AND j.state='finalizing')))) OR (NEW.reporter_email IS NOT NULL AND (EXISTS (SELECT 1 FROM users WHERE email=NEW.reporter_email AND status='deleting') OR
   (EXISTS (SELECT 1 FROM users WHERE email=NEW.reporter_email AND status='deleted')

    AND NOT EXISTS (SELECT 1 FROM account_erasure_subjects s JOIN account_erasure_jobs j ON j.id=s.job_id
      WHERE s.user_email=OLD.reporter_email AND s.tombstone_email=NEW.reporter_email AND j.state='finalizing'))))) AND NOT ((EXISTS(SELECT 1 FROM account_erasure_subjects s JOIN account_erasure_jobs j ON j.id=s.job_id WHERE s.user_email IN(OLD.decided_by_email,OLD.reporter_email) AND j.state!='completed') AND (NEW.evidence_json IS NOT OLD.evidence_json OR NEW.details IS NOT OLD.details OR NEW.reason IS NOT OLD.reason OR NEW.appeal_text IS NOT OLD.appeal_text OR NEW.decided_by_email IS NOT OLD.decided_by_email) AND NEW.id IS OLD.id AND NEW.reporter_email IS OLD.reporter_email AND NEW.entity_type IS OLD.entity_type AND NEW.entity_id IS OLD.entity_id AND NEW.status IS OLD.status AND NEW.decision IS OLD.decision AND NEW.decided_at IS OLD.decided_at AND NEW.appealed_at IS OLD.appealed_at AND NEW.created_at IS OLD.created_at AND NEW.updated_at IS OLD.updated_at AND (NEW.evidence_json IS OLD.evidence_json OR NEW.evidence_json IS '{}') AND (NEW.details IS OLD.details OR NEW.details IS '') AND (NEW.reason IS OLD.reason OR NEW.reason IS 'Silinmiş içerik') AND (NEW.appeal_text IS OLD.appeal_text OR NEW.appeal_text IS NULL) AND (NEW.decided_by_email IS OLD.decided_by_email OR NEW.decided_by_email IS NULL)) OR 0)
BEGIN SELECT RAISE(ABORT,'ACCOUNT_ERASURE_FROZEN'); END;

CREATE TRIGGER erasure_direct_conversations_insert BEFORE INSERT ON direct_conversations
WHEN (NEW.member_two_email IS NOT NULL AND EXISTS (SELECT 1 FROM users WHERE email=NEW.member_two_email AND status IN ('deleting','deleted'))) OR (NEW.member_one_email IS NOT NULL AND EXISTS (SELECT 1 FROM users WHERE email=NEW.member_one_email AND status IN ('deleting','deleted')))
BEGIN SELECT RAISE(ABORT,'ACCOUNT_ERASURE_FROZEN'); END;
CREATE TRIGGER erasure_direct_conversations_update BEFORE UPDATE ON direct_conversations
WHEN ((NEW.member_two_email IS NOT NULL AND (EXISTS (SELECT 1 FROM users WHERE email=NEW.member_two_email AND status='deleting') OR
   (EXISTS (SELECT 1 FROM users WHERE email=NEW.member_two_email AND status='deleted')
    AND NEW.member_two_email IS NOT OLD.member_two_email
    AND NOT EXISTS (SELECT 1 FROM account_erasure_subjects s JOIN account_erasure_jobs j ON j.id=s.job_id
      WHERE s.user_email IN(OLD.member_one_email,OLD.member_two_email) AND s.tombstone_email=NEW.member_two_email AND j.state='finalizing')))) OR (NEW.member_one_email IS NOT NULL AND (EXISTS (SELECT 1 FROM users WHERE email=NEW.member_one_email AND status='deleting') OR
   (EXISTS (SELECT 1 FROM users WHERE email=NEW.member_one_email AND status='deleted')
    AND NEW.member_one_email IS NOT OLD.member_one_email
    AND NOT EXISTS (SELECT 1 FROM account_erasure_subjects s JOIN account_erasure_jobs j ON j.id=s.job_id
      WHERE s.user_email IN(OLD.member_one_email,OLD.member_two_email) AND s.tombstone_email=NEW.member_one_email AND j.state='finalizing'))))) AND NOT (0 OR (NEW.id IS OLD.id AND NEW.university_id IS OLD.university_id AND NEW.last_message_at IS OLD.last_message_at AND NEW.created_at IS OLD.created_at AND NEW.updated_at IS OLD.updated_at AND EXISTS(SELECT 1 FROM account_erasure_subjects s JOIN account_erasure_jobs j ON j.id=s.job_id WHERE j.state='finalizing' AND j.lease_token IS NOT NULL AND s.user_email IN(OLD.member_one_email,OLD.member_two_email)
    AND NEW.member_one_email=min(CASE WHEN OLD.member_one_email=s.user_email THEN s.tombstone_email ELSE OLD.member_one_email END,CASE WHEN OLD.member_two_email=s.user_email THEN s.tombstone_email ELSE OLD.member_two_email END)
    AND NEW.member_two_email=max(CASE WHEN OLD.member_one_email=s.user_email THEN s.tombstone_email ELSE OLD.member_one_email END,CASE WHEN OLD.member_two_email=s.user_email THEN s.tombstone_email ELSE OLD.member_two_email END))))
BEGIN SELECT RAISE(ABORT,'ACCOUNT_ERASURE_FROZEN'); END;

CREATE TRIGGER erasure_direct_messages_insert BEFORE INSERT ON direct_messages
WHEN (NEW.sender_email IS NOT NULL AND EXISTS (SELECT 1 FROM users WHERE email=NEW.sender_email AND status IN ('deleting','deleted')))
BEGIN SELECT RAISE(ABORT,'ACCOUNT_ERASURE_FROZEN'); END;
CREATE TRIGGER erasure_direct_messages_update BEFORE UPDATE ON direct_messages
WHEN ((NEW.sender_email IS NOT NULL AND (EXISTS (SELECT 1 FROM users WHERE email=NEW.sender_email AND status='deleting') OR
   (EXISTS (SELECT 1 FROM users WHERE email=NEW.sender_email AND status='deleted')

    AND NOT EXISTS (SELECT 1 FROM account_erasure_subjects s JOIN account_erasure_jobs j ON j.id=s.job_id
      WHERE s.user_email=OLD.sender_email AND s.tombstone_email=NEW.sender_email AND j.state='finalizing'))))) AND NOT ((EXISTS(SELECT 1 FROM account_erasure_subjects s JOIN account_erasure_jobs j ON j.id=s.job_id WHERE s.user_email IN(OLD.sender_email) AND j.state!='completed') AND (NEW.attachment_type IS NOT OLD.attachment_type OR NEW.attachment_id IS NOT OLD.attachment_id OR NEW.attachment_snapshot IS NOT OLD.attachment_snapshot) AND NEW.id IS OLD.id AND NEW.conversation_id IS OLD.conversation_id AND NEW.sender_email IS OLD.sender_email AND NEW.body IS OLD.body AND NEW.read_at IS OLD.read_at AND NEW.deleted_at IS OLD.deleted_at AND NEW.created_at IS OLD.created_at AND NEW.updated_at IS OLD.updated_at AND NEW.client_message_key IS OLD.client_message_key AND (NEW.attachment_type IS OLD.attachment_type OR NEW.attachment_type IS NULL) AND (NEW.attachment_id IS OLD.attachment_id OR NEW.attachment_id IS NULL) AND (NEW.attachment_snapshot IS OLD.attachment_snapshot OR NEW.attachment_snapshot IS '{}')) OR 0)
BEGIN SELECT RAISE(ABORT,'ACCOUNT_ERASURE_FROZEN'); END;

CREATE TRIGGER erasure_housing_discussions_insert BEFORE INSERT ON housing_discussions
WHEN (NEW.author_email IS NOT NULL AND EXISTS (SELECT 1 FROM users WHERE email=NEW.author_email AND status IN ('deleting','deleted')))
BEGIN SELECT RAISE(ABORT,'ACCOUNT_ERASURE_FROZEN'); END;
CREATE TRIGGER erasure_housing_discussions_update BEFORE UPDATE ON housing_discussions
WHEN ((NEW.author_email IS NOT NULL AND (EXISTS (SELECT 1 FROM users WHERE email=NEW.author_email AND status='deleting') OR
   (EXISTS (SELECT 1 FROM users WHERE email=NEW.author_email AND status='deleted')

    AND NOT EXISTS (SELECT 1 FROM account_erasure_subjects s JOIN account_erasure_jobs j ON j.id=s.job_id
      WHERE s.user_email=OLD.author_email AND s.tombstone_email=NEW.author_email AND j.state='finalizing'))))) AND NOT (0 OR 0)
BEGIN SELECT RAISE(ABORT,'ACCOUNT_ERASURE_FROZEN'); END;

CREATE TRIGGER erasure_library_areas_insert BEFORE INSERT ON library_areas
WHEN (NEW.creator_email IS NOT NULL AND EXISTS (SELECT 1 FROM users WHERE email=NEW.creator_email AND status IN ('deleting','deleted')))
BEGIN SELECT RAISE(ABORT,'ACCOUNT_ERASURE_FROZEN'); END;
CREATE TRIGGER erasure_library_areas_update BEFORE UPDATE ON library_areas
WHEN ((NEW.creator_email IS NOT NULL AND (EXISTS (SELECT 1 FROM users WHERE email=NEW.creator_email AND status='deleting') OR
   (EXISTS (SELECT 1 FROM users WHERE email=NEW.creator_email AND status='deleted')
    AND NEW.creator_email IS NOT OLD.creator_email
    AND NOT EXISTS (SELECT 1 FROM account_erasure_subjects s JOIN account_erasure_jobs j ON j.id=s.job_id
      WHERE s.user_email=OLD.creator_email AND s.tombstone_email=NEW.creator_email AND j.state='finalizing'))))) AND NOT (0 OR 0)
BEGIN SELECT RAISE(ABORT,'ACCOUNT_ERASURE_FROZEN'); END;

CREATE TRIGGER erasure_library_checkins_insert BEFORE INSERT ON library_checkins
WHEN (NEW.user_email IS NOT NULL AND EXISTS (SELECT 1 FROM users WHERE email=NEW.user_email AND status IN ('deleting','deleted')))
BEGIN SELECT RAISE(ABORT,'ACCOUNT_ERASURE_FROZEN'); END;
CREATE TRIGGER erasure_library_checkins_update BEFORE UPDATE ON library_checkins
WHEN ((NEW.user_email IS NOT NULL AND (EXISTS (SELECT 1 FROM users WHERE email=NEW.user_email AND status='deleting') OR
   (EXISTS (SELECT 1 FROM users WHERE email=NEW.user_email AND status='deleted')

    AND NOT EXISTS (SELECT 1 FROM account_erasure_subjects s JOIN account_erasure_jobs j ON j.id=s.job_id
      WHERE s.user_email=OLD.user_email AND s.tombstone_email=NEW.user_email AND j.state='finalizing'))))) AND NOT (0 OR 0)
BEGIN SELECT RAISE(ABORT,'ACCOUNT_ERASURE_FROZEN'); END;

CREATE TRIGGER erasure_market_media_requests_insert BEFORE INSERT ON market_media_requests
WHEN (NEW.owner_email IS NOT NULL AND EXISTS (SELECT 1 FROM users WHERE email=NEW.owner_email AND status IN ('deleting','deleted')))
BEGIN SELECT RAISE(ABORT,'ACCOUNT_ERASURE_FROZEN'); END;

CREATE TRIGGER erasure_market_media_tombstones_insert BEFORE INSERT ON market_media_tombstones
WHEN (NEW.owner_email IS NOT NULL AND EXISTS (SELECT 1 FROM users WHERE email=NEW.owner_email AND status IN ('deleting','deleted')))
BEGIN SELECT RAISE(ABORT,'ACCOUNT_ERASURE_FROZEN'); END;

CREATE TRIGGER erasure_market_write_requests_insert BEFORE INSERT ON market_write_requests
WHEN (NEW.owner_email IS NOT NULL AND EXISTS (SELECT 1 FROM users WHERE email=NEW.owner_email AND status IN ('deleting','deleted')))
BEGIN SELECT RAISE(ABORT,'ACCOUNT_ERASURE_FROZEN'); END;
CREATE TRIGGER erasure_market_write_requests_update BEFORE UPDATE ON market_write_requests
WHEN ((NEW.owner_email IS NOT NULL AND (EXISTS (SELECT 1 FROM users WHERE email=NEW.owner_email AND status='deleting') OR
   (EXISTS (SELECT 1 FROM users WHERE email=NEW.owner_email AND status='deleted')

    AND NOT EXISTS (SELECT 1 FROM account_erasure_subjects s JOIN account_erasure_jobs j ON j.id=s.job_id
      WHERE s.user_email=OLD.owner_email AND s.tombstone_email=NEW.owner_email AND j.state='finalizing'))))) AND NOT (0 OR 0)
BEGIN SELECT RAISE(ABORT,'ACCOUNT_ERASURE_FROZEN'); END;

CREATE TRIGGER erasure_marketplace_inquiries_insert BEFORE INSERT ON marketplace_inquiries
WHEN (NEW.sender_email IS NOT NULL AND EXISTS (SELECT 1 FROM users WHERE email=NEW.sender_email AND status IN ('deleting','deleted')))
BEGIN SELECT RAISE(ABORT,'ACCOUNT_ERASURE_FROZEN'); END;
CREATE TRIGGER erasure_marketplace_inquiries_update BEFORE UPDATE ON marketplace_inquiries
WHEN ((NEW.sender_email IS NOT NULL AND (EXISTS (SELECT 1 FROM users WHERE email=NEW.sender_email AND status='deleting') OR
   (EXISTS (SELECT 1 FROM users WHERE email=NEW.sender_email AND status='deleted')

    AND NOT EXISTS (SELECT 1 FROM account_erasure_subjects s JOIN account_erasure_jobs j ON j.id=s.job_id
      WHERE s.user_email=OLD.sender_email AND s.tombstone_email=NEW.sender_email AND j.state='finalizing'))))) AND NOT (0 OR 0)
BEGIN SELECT RAISE(ABORT,'ACCOUNT_ERASURE_FROZEN'); END;

CREATE TRIGGER erasure_marketplace_listing_images_insert BEFORE INSERT ON marketplace_listing_images
WHEN (NEW.uploader_email IS NOT NULL AND EXISTS (SELECT 1 FROM users WHERE email=NEW.uploader_email AND status IN ('deleting','deleted')))
BEGIN SELECT RAISE(ABORT,'ACCOUNT_ERASURE_FROZEN'); END;
CREATE TRIGGER erasure_marketplace_listing_images_update BEFORE UPDATE ON marketplace_listing_images
WHEN ((NEW.uploader_email IS NOT NULL AND (EXISTS (SELECT 1 FROM users WHERE email=NEW.uploader_email AND status='deleting') OR
   (EXISTS (SELECT 1 FROM users WHERE email=NEW.uploader_email AND status='deleted')

    AND NOT EXISTS (SELECT 1 FROM account_erasure_subjects s JOIN account_erasure_jobs j ON j.id=s.job_id
      WHERE s.user_email=OLD.uploader_email AND s.tombstone_email=NEW.uploader_email AND j.state='finalizing'))))) AND NOT (0 OR 0)
BEGIN SELECT RAISE(ABORT,'ACCOUNT_ERASURE_FROZEN'); END;

CREATE TRIGGER erasure_marketplace_listings_insert BEFORE INSERT ON marketplace_listings
WHEN (NEW.owner_email IS NOT NULL AND EXISTS (SELECT 1 FROM users WHERE email=NEW.owner_email AND status IN ('deleting','deleted')))
BEGIN SELECT RAISE(ABORT,'ACCOUNT_ERASURE_FROZEN'); END;
CREATE TRIGGER erasure_marketplace_listings_update BEFORE UPDATE ON marketplace_listings
WHEN ((NEW.owner_email IS NOT NULL AND (EXISTS (SELECT 1 FROM users WHERE email=NEW.owner_email AND status='deleting') OR
   (EXISTS (SELECT 1 FROM users WHERE email=NEW.owner_email AND status='deleted')

    AND NOT EXISTS (SELECT 1 FROM account_erasure_subjects s JOIN account_erasure_jobs j ON j.id=s.job_id
      WHERE s.user_email=OLD.owner_email AND s.tombstone_email=NEW.owner_email AND j.state='finalizing'))))) AND NOT (0 OR 0)
BEGIN SELECT RAISE(ABORT,'ACCOUNT_ERASURE_FROZEN'); END;

CREATE TRIGGER erasure_meetup_requests_insert BEFORE INSERT ON meetup_requests
WHEN (NEW.recipient_email IS NOT NULL AND EXISTS (SELECT 1 FROM users WHERE email=NEW.recipient_email AND status IN ('deleting','deleted'))) OR (NEW.sender_email IS NOT NULL AND EXISTS (SELECT 1 FROM users WHERE email=NEW.sender_email AND status IN ('deleting','deleted')))
BEGIN SELECT RAISE(ABORT,'ACCOUNT_ERASURE_FROZEN'); END;
CREATE TRIGGER erasure_meetup_requests_update BEFORE UPDATE ON meetup_requests
WHEN ((NEW.recipient_email IS NOT NULL AND (EXISTS (SELECT 1 FROM users WHERE email=NEW.recipient_email AND status='deleting') OR
   (EXISTS (SELECT 1 FROM users WHERE email=NEW.recipient_email AND status='deleted')

    AND NOT EXISTS (SELECT 1 FROM account_erasure_subjects s JOIN account_erasure_jobs j ON j.id=s.job_id
      WHERE s.user_email=OLD.recipient_email AND s.tombstone_email=NEW.recipient_email AND j.state='finalizing')))) OR (NEW.sender_email IS NOT NULL AND (EXISTS (SELECT 1 FROM users WHERE email=NEW.sender_email AND status='deleting') OR
   (EXISTS (SELECT 1 FROM users WHERE email=NEW.sender_email AND status='deleted')

    AND NOT EXISTS (SELECT 1 FROM account_erasure_subjects s JOIN account_erasure_jobs j ON j.id=s.job_id
      WHERE s.user_email=OLD.sender_email AND s.tombstone_email=NEW.sender_email AND j.state='finalizing'))))) AND NOT (0 OR 0)
BEGIN SELECT RAISE(ABORT,'ACCOUNT_ERASURE_FROZEN'); END;

CREATE TRIGGER erasure_note_comments_insert BEFORE INSERT ON note_comments
WHEN (NEW.author_email IS NOT NULL AND EXISTS (SELECT 1 FROM users WHERE email=NEW.author_email AND status IN ('deleting','deleted')))
BEGIN SELECT RAISE(ABORT,'ACCOUNT_ERASURE_FROZEN'); END;
CREATE TRIGGER erasure_note_comments_update BEFORE UPDATE ON note_comments
WHEN ((NEW.author_email IS NOT NULL AND (EXISTS (SELECT 1 FROM users WHERE email=NEW.author_email AND status='deleting') OR
   (EXISTS (SELECT 1 FROM users WHERE email=NEW.author_email AND status='deleted')

    AND NOT EXISTS (SELECT 1 FROM account_erasure_subjects s JOIN account_erasure_jobs j ON j.id=s.job_id
      WHERE s.user_email=OLD.author_email AND s.tombstone_email=NEW.author_email AND j.state='finalizing'))))) AND NOT (0 OR 0)
BEGIN SELECT RAISE(ABORT,'ACCOUNT_ERASURE_FROZEN'); END;

CREATE TRIGGER erasure_note_feedback_insert BEFORE INSERT ON note_feedback
WHEN (NEW.user_email IS NOT NULL AND EXISTS (SELECT 1 FROM users WHERE email=NEW.user_email AND status IN ('deleting','deleted')))
BEGIN SELECT RAISE(ABORT,'ACCOUNT_ERASURE_FROZEN'); END;
CREATE TRIGGER erasure_note_feedback_update BEFORE UPDATE ON note_feedback
WHEN ((NEW.user_email IS NOT NULL AND (EXISTS (SELECT 1 FROM users WHERE email=NEW.user_email AND status='deleting') OR
   (EXISTS (SELECT 1 FROM users WHERE email=NEW.user_email AND status='deleted')

    AND NOT EXISTS (SELECT 1 FROM account_erasure_subjects s JOIN account_erasure_jobs j ON j.id=s.job_id
      WHERE s.user_email=OLD.user_email AND s.tombstone_email=NEW.user_email AND j.state='finalizing'))))) AND NOT (0 OR 0)
BEGIN SELECT RAISE(ABORT,'ACCOUNT_ERASURE_FROZEN'); END;

CREATE TRIGGER erasure_note_saves_insert BEFORE INSERT ON note_saves
WHEN (NEW.user_email IS NOT NULL AND EXISTS (SELECT 1 FROM users WHERE email=NEW.user_email AND status IN ('deleting','deleted')))
BEGIN SELECT RAISE(ABORT,'ACCOUNT_ERASURE_FROZEN'); END;
CREATE TRIGGER erasure_note_saves_update BEFORE UPDATE ON note_saves
WHEN ((NEW.user_email IS NOT NULL AND (EXISTS (SELECT 1 FROM users WHERE email=NEW.user_email AND status='deleting') OR
   (EXISTS (SELECT 1 FROM users WHERE email=NEW.user_email AND status='deleted')

    AND NOT EXISTS (SELECT 1 FROM account_erasure_subjects s JOIN account_erasure_jobs j ON j.id=s.job_id
      WHERE s.user_email=OLD.user_email AND s.tombstone_email=NEW.user_email AND j.state='finalizing'))))) AND NOT (0 OR 0)
BEGIN SELECT RAISE(ABORT,'ACCOUNT_ERASURE_FROZEN'); END;

CREATE TRIGGER erasure_note_views_insert BEFORE INSERT ON note_views
WHEN (NEW.user_email IS NOT NULL AND EXISTS (SELECT 1 FROM users WHERE email=NEW.user_email AND status IN ('deleting','deleted')))
BEGIN SELECT RAISE(ABORT,'ACCOUNT_ERASURE_FROZEN'); END;
CREATE TRIGGER erasure_note_views_update BEFORE UPDATE ON note_views
WHEN ((NEW.user_email IS NOT NULL AND (EXISTS (SELECT 1 FROM users WHERE email=NEW.user_email AND status='deleting') OR
   (EXISTS (SELECT 1 FROM users WHERE email=NEW.user_email AND status='deleted')

    AND NOT EXISTS (SELECT 1 FROM account_erasure_subjects s JOIN account_erasure_jobs j ON j.id=s.job_id
      WHERE s.user_email=OLD.user_email AND s.tombstone_email=NEW.user_email AND j.state='finalizing'))))) AND NOT (0 OR 0)
BEGIN SELECT RAISE(ABORT,'ACCOUNT_ERASURE_FROZEN'); END;

CREATE TRIGGER erasure_notes_insert BEFORE INSERT ON notes
WHEN (NEW.owner_email IS NOT NULL AND EXISTS (SELECT 1 FROM users WHERE email=NEW.owner_email AND status IN ('deleting','deleted')))
BEGIN SELECT RAISE(ABORT,'ACCOUNT_ERASURE_FROZEN'); END;
CREATE TRIGGER erasure_notes_update BEFORE UPDATE ON notes
WHEN ((NEW.owner_email IS NOT NULL AND (EXISTS (SELECT 1 FROM users WHERE email=NEW.owner_email AND status='deleting') OR
   (EXISTS (SELECT 1 FROM users WHERE email=NEW.owner_email AND status='deleted')

    AND NOT EXISTS (SELECT 1 FROM account_erasure_subjects s JOIN account_erasure_jobs j ON j.id=s.job_id
      WHERE s.user_email=OLD.owner_email AND s.tombstone_email=NEW.owner_email AND j.state='finalizing'))))) AND NOT (0 OR 0)
BEGIN SELECT RAISE(ABORT,'ACCOUNT_ERASURE_FROZEN'); END;

CREATE TRIGGER erasure_notification_preferences_insert BEFORE INSERT ON notification_preferences
WHEN (NEW.user_email IS NOT NULL AND EXISTS (SELECT 1 FROM users WHERE email=NEW.user_email AND status IN ('deleting','deleted')))
BEGIN SELECT RAISE(ABORT,'ACCOUNT_ERASURE_FROZEN'); END;
CREATE TRIGGER erasure_notification_preferences_update BEFORE UPDATE ON notification_preferences
WHEN ((NEW.user_email IS NOT NULL AND (EXISTS (SELECT 1 FROM users WHERE email=NEW.user_email AND status='deleting') OR
   (EXISTS (SELECT 1 FROM users WHERE email=NEW.user_email AND status='deleted')

    AND NOT EXISTS (SELECT 1 FROM account_erasure_subjects s JOIN account_erasure_jobs j ON j.id=s.job_id
      WHERE s.user_email=OLD.user_email AND s.tombstone_email=NEW.user_email AND j.state='finalizing'))))) AND NOT (0 OR 0)
BEGIN SELECT RAISE(ABORT,'ACCOUNT_ERASURE_FROZEN'); END;

CREATE TRIGGER erasure_notifications_insert BEFORE INSERT ON notifications
WHEN (NEW.actor_email IS NOT NULL AND EXISTS (SELECT 1 FROM users WHERE email=NEW.actor_email AND status IN ('deleting','deleted'))) OR (NEW.user_email IS NOT NULL AND EXISTS (SELECT 1 FROM users WHERE email=NEW.user_email AND status IN ('deleting','deleted')))
BEGIN SELECT RAISE(ABORT,'ACCOUNT_ERASURE_FROZEN'); END;
CREATE TRIGGER erasure_notifications_update BEFORE UPDATE ON notifications
WHEN ((NEW.actor_email IS NOT NULL AND (EXISTS (SELECT 1 FROM users WHERE email=NEW.actor_email AND status='deleting') OR
   (EXISTS (SELECT 1 FROM users WHERE email=NEW.actor_email AND status='deleted')

    AND NOT EXISTS (SELECT 1 FROM account_erasure_subjects s JOIN account_erasure_jobs j ON j.id=s.job_id
      WHERE s.user_email=OLD.actor_email AND s.tombstone_email=NEW.actor_email AND j.state='finalizing')))) OR (NEW.user_email IS NOT NULL AND (EXISTS (SELECT 1 FROM users WHERE email=NEW.user_email AND status='deleting') OR
   (EXISTS (SELECT 1 FROM users WHERE email=NEW.user_email AND status='deleted')

    AND NOT EXISTS (SELECT 1 FROM account_erasure_subjects s JOIN account_erasure_jobs j ON j.id=s.job_id
      WHERE s.user_email=OLD.user_email AND s.tombstone_email=NEW.user_email AND j.state='finalizing'))))) AND NOT ((EXISTS(SELECT 1 FROM account_erasure_subjects s JOIN account_erasure_jobs j ON j.id=s.job_id WHERE s.user_email IN(OLD.actor_email,OLD.user_email) AND j.state!='completed') AND (NEW.actor_email IS NOT OLD.actor_email OR NEW.title IS NOT OLD.title OR NEW.body IS NOT OLD.body OR NEW.entity_type IS NOT OLD.entity_type OR NEW.entity_id IS NOT OLD.entity_id) AND NEW.id IS OLD.id AND NEW.user_email IS OLD.user_email AND NEW.kind IS OLD.kind AND NEW.read_at IS OLD.read_at AND NEW.created_at IS OLD.created_at AND (NEW.actor_email IS OLD.actor_email OR NEW.actor_email IS NULL) AND (NEW.title IS OLD.title OR NEW.title IS 'Silinmiş içerik') AND (NEW.body IS OLD.body OR NEW.body IS '') AND (NEW.entity_type IS OLD.entity_type OR NEW.entity_type IS NULL) AND (NEW.entity_id IS OLD.entity_id OR NEW.entity_id IS NULL)) OR 0)
BEGIN SELECT RAISE(ABORT,'ACCOUNT_ERASURE_FROZEN'); END;

CREATE TRIGGER erasure_pilot_invites_insert BEFORE INSERT ON pilot_invites
WHEN (NEW.claimed_by_email IS NOT NULL AND EXISTS (SELECT 1 FROM users WHERE email=NEW.claimed_by_email AND status IN ('deleting','deleted'))) OR (NEW.created_by_email IS NOT NULL AND EXISTS (SELECT 1 FROM users WHERE email=NEW.created_by_email AND status IN ('deleting','deleted')))
BEGIN SELECT RAISE(ABORT,'ACCOUNT_ERASURE_FROZEN'); END;
CREATE TRIGGER erasure_pilot_invites_update BEFORE UPDATE ON pilot_invites
WHEN ((NEW.claimed_by_email IS NOT NULL AND (EXISTS (SELECT 1 FROM users WHERE email=NEW.claimed_by_email AND status='deleting') OR
   (EXISTS (SELECT 1 FROM users WHERE email=NEW.claimed_by_email AND status='deleted')

    AND NOT EXISTS (SELECT 1 FROM account_erasure_subjects s JOIN account_erasure_jobs j ON j.id=s.job_id
      WHERE s.user_email=OLD.claimed_by_email AND s.tombstone_email=NEW.claimed_by_email AND j.state='finalizing')))) OR (NEW.created_by_email IS NOT NULL AND (EXISTS (SELECT 1 FROM users WHERE email=NEW.created_by_email AND status='deleting') OR
   (EXISTS (SELECT 1 FROM users WHERE email=NEW.created_by_email AND status='deleted')

    AND NOT EXISTS (SELECT 1 FROM account_erasure_subjects s JOIN account_erasure_jobs j ON j.id=s.job_id
      WHERE s.user_email=OLD.created_by_email AND s.tombstone_email=NEW.created_by_email AND j.state='finalizing'))))) AND NOT ((EXISTS(SELECT 1 FROM account_erasure_subjects s JOIN account_erasure_jobs j ON j.id=s.job_id WHERE s.user_email IN(OLD.claimed_by_email,OLD.created_by_email) AND j.state!='completed') AND (NEW.claimed_by_email IS NOT OLD.claimed_by_email) AND NEW.id IS OLD.id AND NEW.code_hash IS OLD.code_hash AND NEW.created_by_email IS OLD.created_by_email AND NEW.expires_at IS OLD.expires_at AND NEW.claimed_at IS OLD.claimed_at AND NEW.created_at IS OLD.created_at AND (NEW.claimed_by_email IS OLD.claimed_by_email OR NEW.claimed_by_email IS NULL)) OR 0)
BEGIN SELECT RAISE(ABORT,'ACCOUNT_ERASURE_FROZEN'); END;

CREATE TRIGGER erasure_platform_roles_insert BEFORE INSERT ON platform_roles
WHEN (NEW.user_email IS NOT NULL AND EXISTS (SELECT 1 FROM users WHERE email=NEW.user_email AND status IN ('deleting','deleted')))
BEGIN SELECT RAISE(ABORT,'ACCOUNT_ERASURE_FROZEN'); END;
CREATE TRIGGER erasure_platform_roles_update BEFORE UPDATE ON platform_roles
WHEN ((NEW.user_email IS NOT NULL AND (EXISTS (SELECT 1 FROM users WHERE email=NEW.user_email AND status='deleting') OR
   (EXISTS (SELECT 1 FROM users WHERE email=NEW.user_email AND status='deleted')

    AND NOT EXISTS (SELECT 1 FROM account_erasure_subjects s JOIN account_erasure_jobs j ON j.id=s.job_id
      WHERE s.user_email=OLD.user_email AND s.tombstone_email=NEW.user_email AND j.state='finalizing'))))) AND NOT (0 OR 0)
BEGIN SELECT RAISE(ABORT,'ACCOUNT_ERASURE_FROZEN'); END;

CREATE TRIGGER erasure_post_comments_insert BEFORE INSERT ON post_comments
WHEN (NEW.author_email IS NOT NULL AND EXISTS (SELECT 1 FROM users WHERE email=NEW.author_email AND status IN ('deleting','deleted')))
BEGIN SELECT RAISE(ABORT,'ACCOUNT_ERASURE_FROZEN'); END;
CREATE TRIGGER erasure_post_comments_update BEFORE UPDATE ON post_comments
WHEN ((NEW.author_email IS NOT NULL AND (EXISTS (SELECT 1 FROM users WHERE email=NEW.author_email AND status='deleting') OR
   (EXISTS (SELECT 1 FROM users WHERE email=NEW.author_email AND status='deleted')

    AND NOT EXISTS (SELECT 1 FROM account_erasure_subjects s JOIN account_erasure_jobs j ON j.id=s.job_id
      WHERE s.user_email=OLD.author_email AND s.tombstone_email=NEW.author_email AND j.state='finalizing'))))) AND NOT (0 OR 0)
BEGIN SELECT RAISE(ABORT,'ACCOUNT_ERASURE_FROZEN'); END;

CREATE TRIGGER erasure_post_likes_insert BEFORE INSERT ON post_likes
WHEN (NEW.user_email IS NOT NULL AND EXISTS (SELECT 1 FROM users WHERE email=NEW.user_email AND status IN ('deleting','deleted')))
BEGIN SELECT RAISE(ABORT,'ACCOUNT_ERASURE_FROZEN'); END;
CREATE TRIGGER erasure_post_likes_update BEFORE UPDATE ON post_likes
WHEN ((NEW.user_email IS NOT NULL AND (EXISTS (SELECT 1 FROM users WHERE email=NEW.user_email AND status='deleting') OR
   (EXISTS (SELECT 1 FROM users WHERE email=NEW.user_email AND status='deleted')

    AND NOT EXISTS (SELECT 1 FROM account_erasure_subjects s JOIN account_erasure_jobs j ON j.id=s.job_id
      WHERE s.user_email=OLD.user_email AND s.tombstone_email=NEW.user_email AND j.state='finalizing'))))) AND NOT (0 OR 0)
BEGIN SELECT RAISE(ABORT,'ACCOUNT_ERASURE_FROZEN'); END;

CREATE TRIGGER erasure_post_publish_requests_insert BEFORE INSERT ON post_publish_requests
WHEN (NEW.author_email IS NOT NULL AND EXISTS (SELECT 1 FROM users WHERE email=NEW.author_email AND status IN ('deleting','deleted')))
BEGIN SELECT RAISE(ABORT,'ACCOUNT_ERASURE_FROZEN'); END;

CREATE TRIGGER erasure_post_saves_insert BEFORE INSERT ON post_saves
WHEN (NEW.user_email IS NOT NULL AND EXISTS (SELECT 1 FROM users WHERE email=NEW.user_email AND status IN ('deleting','deleted')))
BEGIN SELECT RAISE(ABORT,'ACCOUNT_ERASURE_FROZEN'); END;
CREATE TRIGGER erasure_post_saves_update BEFORE UPDATE ON post_saves
WHEN ((NEW.user_email IS NOT NULL AND (EXISTS (SELECT 1 FROM users WHERE email=NEW.user_email AND status='deleting') OR
   (EXISTS (SELECT 1 FROM users WHERE email=NEW.user_email AND status='deleted')

    AND NOT EXISTS (SELECT 1 FROM account_erasure_subjects s JOIN account_erasure_jobs j ON j.id=s.job_id
      WHERE s.user_email=OLD.user_email AND s.tombstone_email=NEW.user_email AND j.state='finalizing'))))) AND NOT (0 OR 0)
BEGIN SELECT RAISE(ABORT,'ACCOUNT_ERASURE_FROZEN'); END;

CREATE TRIGGER erasure_posts_insert BEFORE INSERT ON posts
WHEN (NEW.author_email IS NOT NULL AND EXISTS (SELECT 1 FROM users WHERE email=NEW.author_email AND status IN ('deleting','deleted')))
BEGIN SELECT RAISE(ABORT,'ACCOUNT_ERASURE_FROZEN'); END;
CREATE TRIGGER erasure_posts_update BEFORE UPDATE ON posts
WHEN ((NEW.author_email IS NOT NULL AND (EXISTS (SELECT 1 FROM users WHERE email=NEW.author_email AND status='deleting') OR
   (EXISTS (SELECT 1 FROM users WHERE email=NEW.author_email AND status='deleted')

    AND NOT EXISTS (SELECT 1 FROM account_erasure_subjects s JOIN account_erasure_jobs j ON j.id=s.job_id
      WHERE s.user_email=OLD.author_email AND s.tombstone_email=NEW.author_email AND j.state='finalizing'))))) AND NOT (0 OR 0)
BEGIN SELECT RAISE(ABORT,'ACCOUNT_ERASURE_FROZEN'); END;

CREATE TRIGGER erasure_product_events_insert BEFORE INSERT ON product_events
WHEN (NEW.user_email IS NOT NULL AND EXISTS (SELECT 1 FROM users WHERE email=NEW.user_email AND status IN ('deleting','deleted')))
BEGIN SELECT RAISE(ABORT,'ACCOUNT_ERASURE_FROZEN'); END;
CREATE TRIGGER erasure_product_events_update BEFORE UPDATE ON product_events
WHEN ((NEW.user_email IS NOT NULL AND (EXISTS (SELECT 1 FROM users WHERE email=NEW.user_email AND status='deleting') OR
   (EXISTS (SELECT 1 FROM users WHERE email=NEW.user_email AND status='deleted')

    AND NOT EXISTS (SELECT 1 FROM account_erasure_subjects s JOIN account_erasure_jobs j ON j.id=s.job_id
      WHERE s.user_email=OLD.user_email AND s.tombstone_email=NEW.user_email AND j.state='finalizing'))))) AND NOT (0 OR 0)
BEGIN SELECT RAISE(ABORT,'ACCOUNT_ERASURE_FROZEN'); END;

CREATE TRIGGER erasure_product_feedback_insert BEFORE INSERT ON product_feedback
WHEN (NEW.user_email IS NOT NULL AND EXISTS (SELECT 1 FROM users WHERE email=NEW.user_email AND status IN ('deleting','deleted')))
BEGIN SELECT RAISE(ABORT,'ACCOUNT_ERASURE_FROZEN'); END;
CREATE TRIGGER erasure_product_feedback_update BEFORE UPDATE ON product_feedback
WHEN ((NEW.user_email IS NOT NULL AND (EXISTS (SELECT 1 FROM users WHERE email=NEW.user_email AND status='deleting') OR
   (EXISTS (SELECT 1 FROM users WHERE email=NEW.user_email AND status='deleted')

    AND NOT EXISTS (SELECT 1 FROM account_erasure_subjects s JOIN account_erasure_jobs j ON j.id=s.job_id
      WHERE s.user_email=OLD.user_email AND s.tombstone_email=NEW.user_email AND j.state='finalizing'))))) AND NOT (0 OR 0)
BEGIN SELECT RAISE(ABORT,'ACCOUNT_ERASURE_FROZEN'); END;

CREATE TRIGGER erasure_profile_media_insert BEFORE INSERT ON profile_media
WHEN (NEW.user_email IS NOT NULL AND EXISTS (SELECT 1 FROM users WHERE email=NEW.user_email AND status IN ('deleting','deleted')))
BEGIN SELECT RAISE(ABORT,'ACCOUNT_ERASURE_FROZEN'); END;
CREATE TRIGGER erasure_profile_media_update BEFORE UPDATE ON profile_media
WHEN ((NEW.user_email IS NOT NULL AND (EXISTS (SELECT 1 FROM users WHERE email=NEW.user_email AND status='deleting') OR
   (EXISTS (SELECT 1 FROM users WHERE email=NEW.user_email AND status='deleted')

    AND NOT EXISTS (SELECT 1 FROM account_erasure_subjects s JOIN account_erasure_jobs j ON j.id=s.job_id
      WHERE s.user_email=OLD.user_email AND s.tombstone_email=NEW.user_email AND j.state='finalizing'))))) AND NOT (0 OR 0)
BEGIN SELECT RAISE(ABORT,'ACCOUNT_ERASURE_FROZEN'); END;

CREATE TRIGGER erasure_push_subscriptions_insert BEFORE INSERT ON push_subscriptions
WHEN (NEW.owner_email IS NOT NULL AND EXISTS (SELECT 1 FROM users WHERE email=NEW.owner_email AND status IN ('deleting','deleted')))
BEGIN SELECT RAISE(ABORT,'ACCOUNT_ERASURE_FROZEN'); END;
CREATE TRIGGER erasure_push_subscriptions_update BEFORE UPDATE ON push_subscriptions
WHEN ((NEW.owner_email IS NOT NULL AND (EXISTS (SELECT 1 FROM users WHERE email=NEW.owner_email AND status='deleting') OR
   (EXISTS (SELECT 1 FROM users WHERE email=NEW.owner_email AND status='deleted')

    AND NOT EXISTS (SELECT 1 FROM account_erasure_subjects s JOIN account_erasure_jobs j ON j.id=s.job_id
      WHERE s.user_email=OLD.owner_email AND s.tombstone_email=NEW.owner_email AND j.state='finalizing'))))) AND NOT (0 OR 0)
BEGIN SELECT RAISE(ABORT,'ACCOUNT_ERASURE_FROZEN'); END;

CREATE TRIGGER erasure_student_courses_insert BEFORE INSERT ON student_courses
WHEN (NEW.user_email IS NOT NULL AND EXISTS (SELECT 1 FROM users WHERE email=NEW.user_email AND status IN ('deleting','deleted')))
BEGIN SELECT RAISE(ABORT,'ACCOUNT_ERASURE_FROZEN'); END;
CREATE TRIGGER erasure_student_courses_update BEFORE UPDATE ON student_courses
WHEN ((NEW.user_email IS NOT NULL AND (EXISTS (SELECT 1 FROM users WHERE email=NEW.user_email AND status='deleting') OR
   (EXISTS (SELECT 1 FROM users WHERE email=NEW.user_email AND status='deleted')

    AND NOT EXISTS (SELECT 1 FROM account_erasure_subjects s JOIN account_erasure_jobs j ON j.id=s.job_id
      WHERE s.user_email=OLD.user_email AND s.tombstone_email=NEW.user_email AND j.state='finalizing'))))) AND NOT (0 OR 0)
BEGIN SELECT RAISE(ABORT,'ACCOUNT_ERASURE_FROZEN'); END;

CREATE TRIGGER erasure_student_profiles_insert BEFORE INSERT ON student_profiles
WHEN (NEW.user_email IS NOT NULL AND EXISTS (SELECT 1 FROM users WHERE email=NEW.user_email AND status IN ('deleting','deleted')))
BEGIN SELECT RAISE(ABORT,'ACCOUNT_ERASURE_FROZEN'); END;
CREATE TRIGGER erasure_student_profiles_update BEFORE UPDATE ON student_profiles
WHEN ((NEW.user_email IS NOT NULL AND (EXISTS (SELECT 1 FROM users WHERE email=NEW.user_email AND status='deleting') OR
   (EXISTS (SELECT 1 FROM users WHERE email=NEW.user_email AND status='deleted')

    AND NOT EXISTS (SELECT 1 FROM account_erasure_subjects s JOIN account_erasure_jobs j ON j.id=s.job_id
      WHERE s.user_email=OLD.user_email AND s.tombstone_email=NEW.user_email AND j.state='finalizing'))))) AND NOT (0 OR 0)
BEGIN SELECT RAISE(ABORT,'ACCOUNT_ERASURE_FROZEN'); END;

CREATE TRIGGER erasure_student_social_profiles_insert BEFORE INSERT ON student_social_profiles
WHEN (NEW.user_email IS NOT NULL AND EXISTS (SELECT 1 FROM users WHERE email=NEW.user_email AND status IN ('deleting','deleted')))
BEGIN SELECT RAISE(ABORT,'ACCOUNT_ERASURE_FROZEN'); END;
CREATE TRIGGER erasure_student_social_profiles_update BEFORE UPDATE ON student_social_profiles
WHEN ((NEW.user_email IS NOT NULL AND (EXISTS (SELECT 1 FROM users WHERE email=NEW.user_email AND status='deleting') OR
   (EXISTS (SELECT 1 FROM users WHERE email=NEW.user_email AND status='deleted')

    AND NOT EXISTS (SELECT 1 FROM account_erasure_subjects s JOIN account_erasure_jobs j ON j.id=s.job_id
      WHERE s.user_email=OLD.user_email AND s.tombstone_email=NEW.user_email AND j.state='finalizing'))))) AND NOT (0 OR 0)
BEGIN SELECT RAISE(ABORT,'ACCOUNT_ERASURE_FROZEN'); END;

CREATE TRIGGER erasure_user_blocks_insert BEFORE INSERT ON user_blocks
WHEN (NEW.blocked_email IS NOT NULL AND EXISTS (SELECT 1 FROM users WHERE email=NEW.blocked_email AND status IN ('deleting','deleted'))) OR (NEW.blocker_email IS NOT NULL AND EXISTS (SELECT 1 FROM users WHERE email=NEW.blocker_email AND status IN ('deleting','deleted')))
BEGIN SELECT RAISE(ABORT,'ACCOUNT_ERASURE_FROZEN'); END;
CREATE TRIGGER erasure_user_blocks_update BEFORE UPDATE ON user_blocks
WHEN ((NEW.blocked_email IS NOT NULL AND (EXISTS (SELECT 1 FROM users WHERE email=NEW.blocked_email AND status='deleting') OR
   (EXISTS (SELECT 1 FROM users WHERE email=NEW.blocked_email AND status='deleted')

    AND NOT EXISTS (SELECT 1 FROM account_erasure_subjects s JOIN account_erasure_jobs j ON j.id=s.job_id
      WHERE s.user_email=OLD.blocked_email AND s.tombstone_email=NEW.blocked_email AND j.state='finalizing')))) OR (NEW.blocker_email IS NOT NULL AND (EXISTS (SELECT 1 FROM users WHERE email=NEW.blocker_email AND status='deleting') OR
   (EXISTS (SELECT 1 FROM users WHERE email=NEW.blocker_email AND status='deleted')

    AND NOT EXISTS (SELECT 1 FROM account_erasure_subjects s JOIN account_erasure_jobs j ON j.id=s.job_id
      WHERE s.user_email=OLD.blocker_email AND s.tombstone_email=NEW.blocker_email AND j.state='finalizing'))))) AND NOT (0 OR 0)
BEGIN SELECT RAISE(ABORT,'ACCOUNT_ERASURE_FROZEN'); END;

CREATE TRIGGER erasure_user_credentials_insert BEFORE INSERT ON user_credentials
WHEN (NEW.user_email IS NOT NULL AND EXISTS (SELECT 1 FROM users WHERE email=NEW.user_email AND status IN ('deleting','deleted')))
BEGIN SELECT RAISE(ABORT,'ACCOUNT_ERASURE_FROZEN'); END;
CREATE TRIGGER erasure_user_credentials_update BEFORE UPDATE ON user_credentials
WHEN ((NEW.user_email IS NOT NULL AND (EXISTS (SELECT 1 FROM users WHERE email=NEW.user_email AND status='deleting') OR
   (EXISTS (SELECT 1 FROM users WHERE email=NEW.user_email AND status='deleted')

    AND NOT EXISTS (SELECT 1 FROM account_erasure_subjects s JOIN account_erasure_jobs j ON j.id=s.job_id
      WHERE s.user_email=OLD.user_email AND s.tombstone_email=NEW.user_email AND j.state='finalizing'))))) AND NOT (0 OR 0)
BEGIN SELECT RAISE(ABORT,'ACCOUNT_ERASURE_FROZEN'); END;

CREATE TRIGGER erasure_user_follows_insert BEFORE INSERT ON user_follows
WHEN (NEW.following_email IS NOT NULL AND EXISTS (SELECT 1 FROM users WHERE email=NEW.following_email AND status IN ('deleting','deleted'))) OR (NEW.follower_email IS NOT NULL AND EXISTS (SELECT 1 FROM users WHERE email=NEW.follower_email AND status IN ('deleting','deleted')))
BEGIN SELECT RAISE(ABORT,'ACCOUNT_ERASURE_FROZEN'); END;
CREATE TRIGGER erasure_user_follows_update BEFORE UPDATE ON user_follows
WHEN ((NEW.following_email IS NOT NULL AND (EXISTS (SELECT 1 FROM users WHERE email=NEW.following_email AND status='deleting') OR
   (EXISTS (SELECT 1 FROM users WHERE email=NEW.following_email AND status='deleted')

    AND NOT EXISTS (SELECT 1 FROM account_erasure_subjects s JOIN account_erasure_jobs j ON j.id=s.job_id
      WHERE s.user_email=OLD.following_email AND s.tombstone_email=NEW.following_email AND j.state='finalizing')))) OR (NEW.follower_email IS NOT NULL AND (EXISTS (SELECT 1 FROM users WHERE email=NEW.follower_email AND status='deleting') OR
   (EXISTS (SELECT 1 FROM users WHERE email=NEW.follower_email AND status='deleted')

    AND NOT EXISTS (SELECT 1 FROM account_erasure_subjects s JOIN account_erasure_jobs j ON j.id=s.job_id
      WHERE s.user_email=OLD.follower_email AND s.tombstone_email=NEW.follower_email AND j.state='finalizing'))))) AND NOT (0 OR 0)
BEGIN SELECT RAISE(ABORT,'ACCOUNT_ERASURE_FROZEN'); END;

CREATE TRIGGER erasure_user_mutes_insert BEFORE INSERT ON user_mutes
WHEN (NEW.muted_email IS NOT NULL AND EXISTS (SELECT 1 FROM users WHERE email=NEW.muted_email AND status IN ('deleting','deleted'))) OR (NEW.muter_email IS NOT NULL AND EXISTS (SELECT 1 FROM users WHERE email=NEW.muter_email AND status IN ('deleting','deleted')))
BEGIN SELECT RAISE(ABORT,'ACCOUNT_ERASURE_FROZEN'); END;
CREATE TRIGGER erasure_user_mutes_update BEFORE UPDATE ON user_mutes
WHEN ((NEW.muted_email IS NOT NULL AND (EXISTS (SELECT 1 FROM users WHERE email=NEW.muted_email AND status='deleting') OR
   (EXISTS (SELECT 1 FROM users WHERE email=NEW.muted_email AND status='deleted')

    AND NOT EXISTS (SELECT 1 FROM account_erasure_subjects s JOIN account_erasure_jobs j ON j.id=s.job_id
      WHERE s.user_email=OLD.muted_email AND s.tombstone_email=NEW.muted_email AND j.state='finalizing')))) OR (NEW.muter_email IS NOT NULL AND (EXISTS (SELECT 1 FROM users WHERE email=NEW.muter_email AND status='deleting') OR
   (EXISTS (SELECT 1 FROM users WHERE email=NEW.muter_email AND status='deleted')

    AND NOT EXISTS (SELECT 1 FROM account_erasure_subjects s JOIN account_erasure_jobs j ON j.id=s.job_id
      WHERE s.user_email=OLD.muter_email AND s.tombstone_email=NEW.muter_email AND j.state='finalizing'))))) AND NOT (0 OR 0)
BEGIN SELECT RAISE(ABORT,'ACCOUNT_ERASURE_FROZEN'); END;

CREATE TRIGGER erasure_user_sessions_insert BEFORE INSERT ON user_sessions
WHEN (NEW.user_email IS NOT NULL AND EXISTS (SELECT 1 FROM users WHERE email=NEW.user_email AND status IN ('deleting','deleted')))
BEGIN SELECT RAISE(ABORT,'ACCOUNT_ERASURE_FROZEN'); END;
CREATE TRIGGER erasure_user_sessions_update BEFORE UPDATE ON user_sessions
WHEN ((NEW.user_email IS NOT NULL AND (EXISTS (SELECT 1 FROM users WHERE email=NEW.user_email AND status='deleting') OR
   (EXISTS (SELECT 1 FROM users WHERE email=NEW.user_email AND status='deleted')

    AND NOT EXISTS (SELECT 1 FROM account_erasure_subjects s JOIN account_erasure_jobs j ON j.id=s.job_id
      WHERE s.user_email=OLD.user_email AND s.tombstone_email=NEW.user_email AND j.state='finalizing'))))) AND NOT (0 OR 0)
BEGIN SELECT RAISE(ABORT,'ACCOUNT_ERASURE_FROZEN'); END;

CREATE TRIGGER erasure_post_media_insert BEFORE INSERT ON post_media
WHEN EXISTS (SELECT 1 FROM posts p JOIN users u ON u.email=p.author_email WHERE p.id=NEW.post_id AND u.status IN ('deleting','deleted')) BEGIN SELECT RAISE(ABORT,'ACCOUNT_ERASURE_FROZEN'); END;

CREATE TRIGGER erasure_post_media_update BEFORE UPDATE ON post_media
WHEN EXISTS (SELECT 1 FROM posts p JOIN users u ON u.email=p.author_email WHERE p.id=NEW.post_id AND u.status IN ('deleting','deleted')) BEGIN SELECT RAISE(ABORT,'ACCOUNT_ERASURE_FROZEN'); END;

CREATE TRIGGER erasure_community_post_meta_insert BEFORE INSERT ON community_post_meta
WHEN EXISTS (SELECT 1 FROM posts p JOIN users u ON u.email=p.author_email WHERE p.id=NEW.post_id AND u.status IN ('deleting','deleted')) BEGIN SELECT RAISE(ABORT,'ACCOUNT_ERASURE_FROZEN'); END;

CREATE TRIGGER erasure_community_post_meta_update BEFORE UPDATE ON community_post_meta
WHEN EXISTS (SELECT 1 FROM posts p JOIN users u ON u.email=p.author_email WHERE p.id=NEW.post_id AND u.status IN ('deleting','deleted')) BEGIN SELECT RAISE(ABORT,'ACCOUNT_ERASURE_FROZEN'); END;

CREATE TRIGGER erasure_post_publish_attempts_insert BEFORE INSERT ON post_publish_attempts
WHEN EXISTS (SELECT 1 FROM post_publish_requests r JOIN users u ON u.email=r.author_email WHERE r.id=NEW.request_id AND u.status IN ('deleting','deleted')) BEGIN SELECT RAISE(ABORT,'ACCOUNT_ERASURE_FROZEN'); END;

CREATE TRIGGER erasure_post_publish_attempt_media_insert BEFORE INSERT ON post_publish_attempt_media
WHEN EXISTS (SELECT 1 FROM post_publish_attempts a JOIN post_publish_requests r ON r.id=a.request_id JOIN users u ON u.email=r.author_email WHERE a.id=NEW.attempt_id AND u.status IN ('deleting','deleted')) BEGIN SELECT RAISE(ABORT,'ACCOUNT_ERASURE_FROZEN'); END;

CREATE TRIGGER erasure_market_media_attempts_insert BEFORE INSERT ON market_media_attempts
WHEN EXISTS (SELECT 1 FROM users u WHERE u.email=NEW.owner_email AND u.status IN ('deleting','deleted')) BEGIN SELECT RAISE(ABORT,'ACCOUNT_ERASURE_FROZEN'); END;

CREATE TRIGGER erasure_market_media_attempt_objects_insert BEFORE INSERT ON market_media_attempt_objects
WHEN EXISTS (SELECT 1 FROM market_media_attempts a JOIN users u ON u.email=a.owner_email WHERE a.id=NEW.attempt_id AND u.status IN ('deleting','deleted')) BEGIN SELECT RAISE(ABORT,'ACCOUNT_ERASURE_FROZEN'); END;

CREATE TRIGGER erasure_post_comments_parent_insert BEFORE INSERT ON post_comments
WHEN EXISTS(SELECT 1 FROM posts p JOIN users u ON u.email=p.author_email WHERE p.id=NEW.post_id AND u.status IN ('deleting','deleted'))
BEGIN SELECT RAISE(ABORT,'ACCOUNT_ERASURE_FROZEN'); END;

CREATE TRIGGER erasure_post_likes_parent_insert BEFORE INSERT ON post_likes
WHEN EXISTS(SELECT 1 FROM posts p JOIN users u ON u.email=p.author_email WHERE p.id=NEW.post_id AND u.status IN ('deleting','deleted'))
BEGIN SELECT RAISE(ABORT,'ACCOUNT_ERASURE_FROZEN'); END;

CREATE TRIGGER erasure_post_saves_parent_insert BEFORE INSERT ON post_saves
WHEN EXISTS(SELECT 1 FROM posts p JOIN users u ON u.email=p.author_email WHERE p.id=NEW.post_id AND u.status IN ('deleting','deleted'))
BEGIN SELECT RAISE(ABORT,'ACCOUNT_ERASURE_FROZEN'); END;

CREATE TRIGGER erasure_note_comments_parent_insert BEFORE INSERT ON note_comments
WHEN EXISTS(SELECT 1 FROM notes p JOIN users u ON u.email=p.owner_email WHERE p.id=NEW.note_id AND u.status IN ('deleting','deleted'))
BEGIN SELECT RAISE(ABORT,'ACCOUNT_ERASURE_FROZEN'); END;

CREATE TRIGGER erasure_note_feedback_parent_insert BEFORE INSERT ON note_feedback
WHEN EXISTS(SELECT 1 FROM notes p JOIN users u ON u.email=p.owner_email WHERE p.id=NEW.note_id AND u.status IN ('deleting','deleted'))
BEGIN SELECT RAISE(ABORT,'ACCOUNT_ERASURE_FROZEN'); END;

CREATE TRIGGER erasure_note_saves_parent_insert BEFORE INSERT ON note_saves
WHEN EXISTS(SELECT 1 FROM notes p JOIN users u ON u.email=p.owner_email WHERE p.id=NEW.note_id AND u.status IN ('deleting','deleted'))
BEGIN SELECT RAISE(ABORT,'ACCOUNT_ERASURE_FROZEN'); END;

CREATE TRIGGER erasure_marketplace_inquiries_parent_insert BEFORE INSERT ON marketplace_inquiries
WHEN EXISTS(SELECT 1 FROM marketplace_listings p JOIN users u ON u.email=p.owner_email WHERE p.id=NEW.listing_id AND u.status IN ('deleting','deleted'))
BEGIN SELECT RAISE(ABORT,'ACCOUNT_ERASURE_FROZEN'); END;

CREATE TRIGGER erasure_audit_logs_insert BEFORE INSERT ON audit_logs
WHEN instr(NEW.actor_email,'@') > 0 AND NOT EXISTS (SELECT 1 FROM users WHERE email=NEW.actor_email AND status NOT IN ('deleting','deleted'))

BEGIN SELECT RAISE(ABORT,'ACCOUNT_ERASURE_FROZEN'); END;

CREATE TRIGGER erasure_audit_logs_update BEFORE UPDATE ON audit_logs
WHEN instr(NEW.actor_email,'@') > 0 AND NOT EXISTS (SELECT 1 FROM users WHERE email=NEW.actor_email AND status NOT IN ('deleting','deleted'))
AND NOT (EXISTS(SELECT 1 FROM account_erasure_subjects s JOIN account_erasure_jobs j ON j.id=s.job_id WHERE s.user_email IN(OLD.actor_email) AND j.state!='completed') AND (NEW.entity_id IS NOT OLD.entity_id OR NEW.detail IS NOT OLD.detail) AND NEW.id IS OLD.id AND NEW.actor_email IS OLD.actor_email AND NEW.action IS OLD.action AND NEW.entity_type IS OLD.entity_type AND NEW.created_at IS OLD.created_at AND (NEW.entity_id IS OLD.entity_id OR NEW.entity_id IS NULL) AND (NEW.detail IS OLD.detail OR NEW.detail IS '{}'))
BEGIN SELECT RAISE(ABORT,'ACCOUNT_ERASURE_FROZEN'); END;

CREATE TRIGGER erasure_rate_limit_windows_insert BEFORE INSERT ON rate_limit_windows
WHEN instr(NEW.actor_email,'@') > 0 AND NOT EXISTS (SELECT 1 FROM users WHERE email=NEW.actor_email AND status NOT IN ('deleting','deleted'))

BEGIN SELECT RAISE(ABORT,'ACCOUNT_ERASURE_FROZEN'); END;

CREATE TRIGGER erasure_rate_limit_windows_update BEFORE UPDATE ON rate_limit_windows
WHEN instr(NEW.actor_email,'@') > 0 AND NOT EXISTS (SELECT 1 FROM users WHERE email=NEW.actor_email AND status NOT IN ('deleting','deleted'))
AND NOT 0
BEGIN SELECT RAISE(ABORT,'ACCOUNT_ERASURE_FROZEN'); END;

CREATE TRIGGER erasure_direct_messages_snapshot_insert BEFORE INSERT ON direct_messages
 WHEN EXISTS(SELECT 1 FROM json_tree(CASE WHEN json_valid(NEW.attachment_snapshot) THEN NEW.attachment_snapshot ELSE '{}' END) value
   JOIN account_erasure_entities e ON value.atom=e.entity_id
   JOIN account_erasure_subjects s ON s.job_id=e.job_id)
 BEGIN SELECT RAISE(ABORT,'ACCOUNT_ERASURE_FROZEN'); END;

CREATE TRIGGER erasure_content_reports_snapshot_insert BEFORE INSERT ON content_reports
 WHEN EXISTS(SELECT 1 FROM json_tree(CASE WHEN json_valid(NEW.evidence_json) THEN NEW.evidence_json ELSE '{}' END) value
   JOIN account_erasure_entities e ON value.atom=e.entity_id
   JOIN account_erasure_subjects s ON s.job_id=e.job_id)
 BEGIN SELECT RAISE(ABORT,'ACCOUNT_ERASURE_FROZEN'); END;

CREATE TRIGGER erasure_audit_logs_snapshot_insert BEFORE INSERT ON audit_logs
 WHEN EXISTS(SELECT 1 FROM json_tree(CASE WHEN json_valid(NEW.detail) THEN NEW.detail ELSE '{}' END) value
   JOIN account_erasure_entities e ON value.atom=e.entity_id
   JOIN account_erasure_subjects s ON s.job_id=e.job_id)
 BEGIN SELECT RAISE(ABORT,'ACCOUNT_ERASURE_FROZEN'); END;

CREATE TRIGGER erasure_staff_audit_logs_snapshot_insert BEFORE INSERT ON staff_audit_logs
 WHEN EXISTS(SELECT 1 FROM json_tree(CASE WHEN json_valid(NEW.detail) THEN NEW.detail ELSE '{}' END) value
   JOIN account_erasure_entities e ON value.atom=e.entity_id
   JOIN account_erasure_subjects s ON s.job_id=e.job_id)
 BEGIN SELECT RAISE(ABORT,'ACCOUNT_ERASURE_FROZEN'); END;

CREATE TRIGGER erasure_community_audit_logs_snapshot_insert BEFORE INSERT ON community_audit_logs
 WHEN EXISTS(SELECT 1 FROM json_tree(CASE WHEN json_valid(NEW.detail) THEN NEW.detail ELSE '{}' END) value
   JOIN account_erasure_entities e ON value.atom=e.entity_id
   JOIN account_erasure_subjects s ON s.job_id=e.job_id)
 BEGIN SELECT RAISE(ABORT,'ACCOUNT_ERASURE_FROZEN'); END;

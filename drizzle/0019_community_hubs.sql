ALTER TABLE `communities` ADD `university_id` text REFERENCES universities(id);--> statement-breakpoint
ALTER TABLE `communities` ADD `moderation_status` text DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE `communities` ADD `last_activity_at` text;--> statement-breakpoint
UPDATE `communities`
SET `university_id` = (
  SELECT sp.university_id FROM student_profiles sp
  WHERE sp.user_email = communities.creator_email LIMIT 1
)
WHERE `university_id` IS NULL;--> statement-breakpoint
UPDATE `communities`
SET `last_activity_at` = COALESCE(
  (SELECT MAX(p.created_at) FROM posts p WHERE p.community_id = communities.id AND p.deleted_at IS NULL),
  communities.created_at
)
WHERE `last_activity_at` IS NULL;--> statement-breakpoint
ALTER TABLE `community_members` ADD `notification_level` text DEFAULT 'all' NOT NULL;--> statement-breakpoint
CREATE INDEX `communities_university_status_activity_idx` ON `communities` (`university_id`,`moderation_status`,`status`,`last_activity_at`);--> statement-breakpoint
CREATE INDEX `posts_community_pinned_created_idx` ON `posts` (`community_id`,`is_pinned`,`created_at`);--> statement-breakpoint
CREATE TABLE `community_post_meta` (
	`post_id` text PRIMARY KEY NOT NULL,
	`post_type` text DEFAULT 'discussion' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`post_id`) REFERENCES `posts`(`id`) ON UPDATE no action ON DELETE cascade
);--> statement-breakpoint
CREATE INDEX `community_post_meta_type_idx` ON `community_post_meta` (`post_type`);--> statement-breakpoint
CREATE TABLE `community_bans` (
	`community_id` text NOT NULL,
	`user_email` text NOT NULL,
	`banned_by_email` text NOT NULL,
	`reason` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY(`community_id`, `user_email`),
	FOREIGN KEY (`community_id`) REFERENCES `communities`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_email`) REFERENCES `users`(`email`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`banned_by_email`) REFERENCES `users`(`email`) ON UPDATE no action ON DELETE cascade
);--> statement-breakpoint
CREATE INDEX `community_bans_actor_idx` ON `community_bans` (`banned_by_email`,`created_at`);--> statement-breakpoint
CREATE TABLE `community_events` (
	`id` text PRIMARY KEY NOT NULL,
	`community_id` text NOT NULL,
	`creator_email` text NOT NULL,
	`title` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`location` text DEFAULT '' NOT NULL,
	`starts_at` text NOT NULL,
	`ends_at` text,
	`capacity` integer,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`community_id`) REFERENCES `communities`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`creator_email`) REFERENCES `users`(`email`) ON UPDATE no action ON DELETE cascade
);--> statement-breakpoint
CREATE INDEX `community_events_community_starts_idx` ON `community_events` (`community_id`,`status`,`starts_at`);--> statement-breakpoint
CREATE TABLE `community_event_attendees` (
	`event_id` text NOT NULL,
	`user_email` text NOT NULL,
	`status` text DEFAULT 'going' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY(`event_id`, `user_email`),
	FOREIGN KEY (`event_id`) REFERENCES `community_events`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_email`) REFERENCES `users`(`email`) ON UPDATE no action ON DELETE cascade
);--> statement-breakpoint
CREATE INDEX `community_event_attendees_user_idx` ON `community_event_attendees` (`user_email`,`status`,`created_at`);

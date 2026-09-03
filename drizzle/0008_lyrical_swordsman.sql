CREATE TABLE `meetup_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`sender_email` text NOT NULL,
	`recipient_email` text NOT NULL,
	`activity` text NOT NULL,
	`message` text DEFAULT '' NOT NULL,
	`proposed_time` text,
	`campus_place` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`expires_at` text NOT NULL,
	`responded_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`sender_email`) REFERENCES `users`(`email`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`recipient_email`) REFERENCES `users`(`email`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `meetup_requests_recipient_status_idx` ON `meetup_requests` (`recipient_email`,`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `meetup_requests_sender_status_idx` ON `meetup_requests` (`sender_email`,`status`,`created_at`);--> statement-breakpoint
CREATE TABLE `student_social_profiles` (
	`user_email` text PRIMARY KEY NOT NULL,
	`interests_json` text DEFAULT '[]' NOT NULL,
	`intents_json` text DEFAULT '[]' NOT NULL,
	`social_bio` text DEFAULT '' NOT NULL,
	`availability` text DEFAULT 'not-looking' NOT NULL,
	`is_discoverable` integer DEFAULT true NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`user_email`) REFERENCES `users`(`email`) ON UPDATE no action ON DELETE cascade
);

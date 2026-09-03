CREATE TABLE `campus_pulse_posts` (
	`id` text PRIMARY KEY NOT NULL,
	`author_email` text NOT NULL,
	`university_id` text NOT NULL,
	`kind` text NOT NULL,
	`category` text DEFAULT 'general' NOT NULL,
	`content` text NOT NULL,
	`campus_zone` text DEFAULT '' NOT NULL,
	`is_anonymous` integer DEFAULT false NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`expires_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`deleted_at` text,
	FOREIGN KEY (`author_email`) REFERENCES `users`(`email`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`university_id`) REFERENCES `universities`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `campus_pulse_university_kind_created_idx` ON `campus_pulse_posts` (`university_id`,`kind`,`created_at`);--> statement-breakpoint
CREATE INDEX `campus_pulse_status_expires_idx` ON `campus_pulse_posts` (`status`,`expires_at`);--> statement-breakpoint
CREATE INDEX `campus_pulse_author_created_idx` ON `campus_pulse_posts` (`author_email`,`created_at`);--> statement-breakpoint
CREATE TABLE `campus_pulse_reactions` (
	`post_id` text NOT NULL,
	`user_email` text NOT NULL,
	`reaction` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY(`post_id`, `user_email`),
	FOREIGN KEY (`post_id`) REFERENCES `campus_pulse_posts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_email`) REFERENCES `users`(`email`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `campus_pulse_reactions_post_idx` ON `campus_pulse_reactions` (`post_id`,`reaction`);
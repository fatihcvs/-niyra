CREATE TABLE `campus_events` (
	`id` text PRIMARY KEY NOT NULL,
	`university_id` text NOT NULL,
	`creator_email` text NOT NULL,
	`place_id` text,
	`title` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`category` text NOT NULL,
	`starts_at` text NOT NULL,
	`ends_at` text,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`university_id`) REFERENCES `universities`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`creator_email`) REFERENCES `users`(`email`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`place_id`) REFERENCES `campus_places`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `campus_events_university_starts_idx` ON `campus_events` (`university_id`,`status`,`starts_at`);--> statement-breakpoint
CREATE TABLE `campus_place_confirmations` (
	`place_id` text NOT NULL,
	`user_email` text NOT NULL,
	`state` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY(`place_id`, `user_email`),
	FOREIGN KEY (`place_id`) REFERENCES `campus_places`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_email`) REFERENCES `users`(`email`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `campus_places` (
	`id` text PRIMARY KEY NOT NULL,
	`university_id` text NOT NULL,
	`creator_email` text NOT NULL,
	`name` text NOT NULL,
	`category` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`address` text DEFAULT '' NOT NULL,
	`latitude` real,
	`longitude` real,
	`accessibility_json` text DEFAULT '[]' NOT NULL,
	`opening_hours` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`verified_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`university_id`) REFERENCES `universities`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`creator_email`) REFERENCES `users`(`email`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `campus_places_university_category_idx` ON `campus_places` (`university_id`,`category`,`status`);--> statement-breakpoint
CREATE INDEX `campus_places_university_updated_idx` ON `campus_places` (`university_id`,`updated_at`);
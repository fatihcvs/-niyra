CREATE TABLE `library_areas` (
	`id` text PRIMARY KEY NOT NULL,
	`university_id` text NOT NULL,
	`place_id` text,
	`creator_email` text NOT NULL,
	`name` text NOT NULL,
	`floor_label` text DEFAULT '' NOT NULL,
	`zone_label` text DEFAULT '' NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`capacity` integer,
	`features_json` text DEFAULT '[]' NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`university_id`) REFERENCES `universities`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`place_id`) REFERENCES `campus_places`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`creator_email`) REFERENCES `users`(`email`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `library_areas_university_status_idx` ON `library_areas` (`university_id`,`status`,`updated_at`);--> statement-breakpoint
CREATE INDEX `library_areas_place_idx` ON `library_areas` (`place_id`,`status`);--> statement-breakpoint
CREATE TABLE `library_checkins` (
	`id` text PRIMARY KEY NOT NULL,
	`area_id` text NOT NULL,
	`user_email` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`expires_at` text NOT NULL,
	`checked_out_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`area_id`) REFERENCES `library_areas`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_email`) REFERENCES `users`(`email`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `library_checkins_area_status_expiry_idx` ON `library_checkins` (`area_id`,`status`,`expires_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `library_checkins_one_active_user_idx` ON `library_checkins` (`user_email`) WHERE "library_checkins"."status" = 'active';
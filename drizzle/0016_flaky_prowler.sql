CREATE TABLE `housing_discussions` (
	`id` text PRIMARY KEY NOT NULL,
	`place_id` text NOT NULL,
	`author_email` text NOT NULL,
	`content` text NOT NULL,
	`is_anonymous` integer DEFAULT false NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`place_id`) REFERENCES `campus_places`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`author_email`) REFERENCES `users`(`email`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `housing_discussions_place_status_created_idx` ON `housing_discussions` (`place_id`,`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `housing_discussions_author_created_idx` ON `housing_discussions` (`author_email`,`created_at`);--> statement-breakpoint
ALTER TABLE `notes` ADD `exam_year` integer;--> statement-breakpoint
ALTER TABLE `notes` ADD `exam_term` text;--> statement-breakpoint
ALTER TABLE `notes` ADD `exam_kind` text;--> statement-breakpoint
CREATE INDEX `notes_exam_course_year_idx` ON `notes` (`note_type`,`course_id`,`exam_year`,`status`);
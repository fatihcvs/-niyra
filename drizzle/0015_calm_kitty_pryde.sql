CREATE TABLE `profile_media` (
	`user_email` text NOT NULL,
	`kind` text NOT NULL,
	`object_key` text NOT NULL,
	`original_file_name` text NOT NULL,
	`content_type` text NOT NULL,
	`byte_size` integer NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY(`user_email`, `kind`),
	FOREIGN KEY (`user_email`) REFERENCES `users`(`email`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `profile_media_kind_updated_idx` ON `profile_media` (`kind`,`updated_at`);--> statement-breakpoint
ALTER TABLE `student_profiles` ADD `bio` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `student_profiles` ADD `links_json` text DEFAULT '[]' NOT NULL;
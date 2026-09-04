CREATE TABLE `note_comments` (
	`id` text PRIMARY KEY NOT NULL,
	`note_id` text NOT NULL,
	`author_email` text NOT NULL,
	`content` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`deleted_at` text,
	FOREIGN KEY (`note_id`) REFERENCES `notes`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`author_email`) REFERENCES `users`(`email`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `note_comments_note_created_idx` ON `note_comments` (`note_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `note_comments_author_idx` ON `note_comments` (`author_email`);--> statement-breakpoint
CREATE TABLE `note_feedback` (
	`note_id` text NOT NULL,
	`user_email` text NOT NULL,
	`value` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY(`note_id`, `user_email`),
	FOREIGN KEY (`note_id`) REFERENCES `notes`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_email`) REFERENCES `users`(`email`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `note_feedback_note_value_idx` ON `note_feedback` (`note_id`,`value`);
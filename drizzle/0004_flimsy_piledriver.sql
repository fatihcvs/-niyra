CREATE TABLE `faculties` (
	`id` text PRIMARY KEY NOT NULL,
	`university_id` text NOT NULL,
	`name` text NOT NULL,
	`short_name` text NOT NULL,
	FOREIGN KEY (`university_id`) REFERENCES `universities`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `user_follows` (
	`follower_email` text NOT NULL,
	`following_email` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY(`follower_email`, `following_email`),
	FOREIGN KEY (`follower_email`) REFERENCES `users`(`email`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`following_email`) REFERENCES `users`(`email`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `user_follows_follower_idx` ON `user_follows` (`follower_email`);--> statement-breakpoint
CREATE INDEX `user_follows_following_idx` ON `user_follows` (`following_email`);--> statement-breakpoint
ALTER TABLE `departments` ADD `faculty_id` text REFERENCES faculties(id);--> statement-breakpoint
ALTER TABLE `users` ADD `public_id` text;--> statement-breakpoint
CREATE UNIQUE INDEX `users_public_id_unique` ON `users` (`public_id`);
CREATE TABLE `user_credentials` (
	`user_email` text PRIMARY KEY NOT NULL,
	`password_hash` text NOT NULL,
	`password_salt` text NOT NULL,
	`password_iterations` integer NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`user_email`) REFERENCES `users`(`email`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `user_sessions` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`user_email` text NOT NULL,
	`expires_at` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`user_email`) REFERENCES `users`(`email`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `user_sessions_user_expires_idx` ON `user_sessions` (`user_email`,`expires_at`);--> statement-breakpoint
CREATE INDEX `user_sessions_expires_idx` ON `user_sessions` (`expires_at`);
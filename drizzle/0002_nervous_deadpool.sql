CREATE INDEX `posts_created_at_idx` ON `posts` (`created_at`);--> statement-breakpoint
CREATE INDEX `posts_author_created_idx` ON `posts` (`author_email`,`created_at`);
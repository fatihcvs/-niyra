CREATE TABLE `marketplace_listing_images` (
	`id` text PRIMARY KEY NOT NULL,
	`listing_id` text NOT NULL,
	`uploader_email` text NOT NULL,
	`object_key` text NOT NULL,
	`original_file_name` text NOT NULL,
	`content_type` text NOT NULL,
	`byte_size` integer NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`listing_id`) REFERENCES `marketplace_listings`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`uploader_email`) REFERENCES `users`(`email`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `marketplace_listing_images_object_key_unique` ON `marketplace_listing_images` (`object_key`);--> statement-breakpoint
CREATE INDEX `marketplace_listing_images_listing_sort_idx` ON `marketplace_listing_images` (`listing_id`,`sort_order`,`created_at`);
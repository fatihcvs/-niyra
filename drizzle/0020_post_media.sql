CREATE TABLE `post_media` (
  `id` text PRIMARY KEY NOT NULL,
  `post_id` text NOT NULL,
  `kind` text NOT NULL CHECK (`kind` IN ('image', 'video')),
  `object_key` text NOT NULL,
  `original_file_name` text NOT NULL,
  `content_type` text NOT NULL,
  `byte_size` integer NOT NULL CHECK (`byte_size` > 0),
  `created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  FOREIGN KEY (`post_id`) REFERENCES `posts`(`id`) ON UPDATE no action ON DELETE cascade
);--> statement-breakpoint
CREATE INDEX `post_media_post_kind_idx` ON `post_media` (`post_id`, `kind`);--> statement-breakpoint
CREATE UNIQUE INDEX `post_media_object_key_unique` ON `post_media` (`object_key`);

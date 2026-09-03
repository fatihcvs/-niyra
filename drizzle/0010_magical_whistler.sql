CREATE TABLE `campus_price_reports` (
	`id` text PRIMARY KEY NOT NULL,
	`university_id` text NOT NULL,
	`reporter_email` text NOT NULL,
	`place_id` text,
	`place_name` text NOT NULL,
	`item_name` text NOT NULL,
	`category` text NOT NULL,
	`price_cents` integer NOT NULL,
	`observed_at` text NOT NULL,
	`source_note` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`university_id`) REFERENCES `universities`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`reporter_email`) REFERENCES `users`(`email`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`place_id`) REFERENCES `campus_places`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `campus_price_reports_university_observed_idx` ON `campus_price_reports` (`university_id`,`status`,`observed_at`);--> statement-breakpoint
CREATE INDEX `campus_price_reports_place_item_idx` ON `campus_price_reports` (`university_id`,`place_name`,`item_name`);--> statement-breakpoint
CREATE TABLE `marketplace_inquiries` (
	`id` text PRIMARY KEY NOT NULL,
	`listing_id` text NOT NULL,
	`sender_email` text NOT NULL,
	`message` text NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`listing_id`) REFERENCES `marketplace_listings`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`sender_email`) REFERENCES `users`(`email`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `marketplace_inquiries_listing_status_idx` ON `marketplace_inquiries` (`listing_id`,`status`,`created_at`);--> statement-breakpoint
CREATE TABLE `marketplace_listings` (
	`id` text PRIMARY KEY NOT NULL,
	`university_id` text NOT NULL,
	`owner_email` text NOT NULL,
	`kind` text NOT NULL,
	`category` text NOT NULL,
	`title` text NOT NULL,
	`description` text NOT NULL,
	`price_cents` integer,
	`condition` text DEFAULT 'used-good' NOT NULL,
	`meetup_place` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`university_id`) REFERENCES `universities`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`owner_email`) REFERENCES `users`(`email`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `marketplace_listings_university_status_idx` ON `marketplace_listings` (`university_id`,`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `marketplace_listings_owner_status_idx` ON `marketplace_listings` (`owner_email`,`status`,`created_at`);
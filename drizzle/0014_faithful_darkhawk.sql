CREATE TABLE `platform_settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value_json` text NOT NULL,
	`updated_by_staff_id` text,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`updated_by_staff_id`) REFERENCES `staff_accounts`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `staff_accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`username` text NOT NULL,
	`display_name` text NOT NULL,
	`role` text NOT NULL,
	`password_hash` text NOT NULL,
	`password_salt` text NOT NULL,
	`password_iterations` integer NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`must_change_password` integer DEFAULT true NOT NULL,
	`created_by_staff_id` text,
	`last_login_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `staff_accounts_username_unique` ON `staff_accounts` (`username`);--> statement-breakpoint
CREATE INDEX `staff_accounts_role_status_idx` ON `staff_accounts` (`role`,`status`);--> statement-breakpoint
CREATE TABLE `staff_audit_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`staff_id` text,
	`action` text NOT NULL,
	`entity_type` text,
	`entity_id` text,
	`detail` text DEFAULT '{}' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`staff_id`) REFERENCES `staff_accounts`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `staff_audit_staff_created_idx` ON `staff_audit_logs` (`staff_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `staff_audit_action_created_idx` ON `staff_audit_logs` (`action`,`created_at`);--> statement-breakpoint
CREATE TABLE `staff_sessions` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`staff_id` text NOT NULL,
	`expires_at` text NOT NULL,
	`last_seen_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`staff_id`) REFERENCES `staff_accounts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `staff_sessions_staff_expiry_idx` ON `staff_sessions` (`staff_id`,`expires_at`);--> statement-breakpoint
CREATE INDEX `staff_sessions_expiry_idx` ON `staff_sessions` (`expires_at`);--> statement-breakpoint
ALTER TABLE `users` ADD `status` text DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `suspended_at` text;--> statement-breakpoint
ALTER TABLE `users` ADD `suspended_reason` text;
CREATE TABLE `direct_conversations` (
	`id` text PRIMARY KEY NOT NULL,
	`university_id` text NOT NULL,
	`member_one_email` text NOT NULL,
	`member_two_email` text NOT NULL,
	`last_message_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`university_id`) REFERENCES `universities`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`member_one_email`) REFERENCES `users`(`email`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`member_two_email`) REFERENCES `users`(`email`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT `direct_conversations_ordered_members` CHECK (`member_one_email` < `member_two_email`)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `direct_conversations_pair_unique` ON `direct_conversations` (`member_one_email`,`member_two_email`);
--> statement-breakpoint
CREATE INDEX `direct_conversations_member_one_updated_idx` ON `direct_conversations` (`member_one_email`,`updated_at`);
--> statement-breakpoint
CREATE INDEX `direct_conversations_member_two_updated_idx` ON `direct_conversations` (`member_two_email`,`updated_at`);
--> statement-breakpoint
CREATE TABLE `direct_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`conversation_id` text NOT NULL,
	`sender_email` text NOT NULL,
	`body` text DEFAULT '' NOT NULL,
	`attachment_type` text,
	`attachment_id` text,
	`attachment_snapshot` text DEFAULT '{}' NOT NULL,
	`read_at` text,
	`deleted_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`conversation_id`) REFERENCES `direct_conversations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`sender_email`) REFERENCES `users`(`email`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `direct_messages_conversation_created_idx` ON `direct_messages` (`conversation_id`,`created_at`);
--> statement-breakpoint
CREATE INDEX `direct_messages_conversation_read_idx` ON `direct_messages` (`conversation_id`,`read_at`,`created_at`);
--> statement-breakpoint
CREATE INDEX `direct_messages_sender_created_idx` ON `direct_messages` (`sender_email`,`created_at`);

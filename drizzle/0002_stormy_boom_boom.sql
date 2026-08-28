CREATE TABLE `google_auth_sessions` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_google_auth_sessions_user_id` ON `google_auth_sessions` (`user_id`);--> statement-breakpoint
CREATE INDEX `idx_google_auth_sessions_expires_at` ON `google_auth_sessions` (`expires_at`);--> statement-breakpoint
CREATE TABLE `google_users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`display_name` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);

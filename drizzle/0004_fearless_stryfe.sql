CREATE TABLE `cycle_phases` (
	`id` text NOT NULL,
	`cycle_id` text NOT NULL,
	`owner_id` text NOT NULL,
	`title` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`start_date` text NOT NULL,
	`end_date` text NOT NULL,
	`position` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`owner_id`, `id`)
);
--> statement-breakpoint
CREATE INDEX `idx_cycle_phases_owner_cycle_position` ON `cycle_phases` (`owner_id`,`cycle_id`,`position`);--> statement-breakpoint
CREATE TABLE `cycles` (
	`id` text NOT NULL,
	`owner_id` text NOT NULL,
	`title` text NOT NULL,
	`goal` text NOT NULL,
	`start_date` text NOT NULL,
	`end_date` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`revision` text DEFAULT '' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`owner_id`, `id`)
);
--> statement-breakpoint
CREATE INDEX `idx_cycles_owner_dates` ON `cycles` (`owner_id`,`start_date`,`end_date`);
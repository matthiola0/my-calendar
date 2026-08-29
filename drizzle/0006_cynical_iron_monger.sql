CREATE TABLE `custom_field_entries` (
	`owner_id` text NOT NULL,
	`field_id` text NOT NULL,
	`date` text NOT NULL,
	`content` text DEFAULT '' NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`owner_id`, `field_id`, `date`)
);
--> statement-breakpoint
CREATE INDEX `idx_custom_field_entries_owner_date` ON `custom_field_entries` (`owner_id`,`date`);--> statement-breakpoint
CREATE TABLE `custom_fields` (
	`id` text NOT NULL,
	`owner_id` text NOT NULL,
	`title` text NOT NULL,
	`position` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`owner_id`, `id`)
);
--> statement-breakpoint
CREATE INDEX `idx_custom_fields_owner_position` ON `custom_fields` (`owner_id`,`position`);--> statement-breakpoint
CREATE TABLE `day_sections` (
	`id` text NOT NULL,
	`owner_id` text NOT NULL,
	`title` text NOT NULL,
	`position` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`owner_id`, `id`)
);
--> statement-breakpoint
CREATE INDEX `idx_day_sections_owner_position` ON `day_sections` (`owner_id`,`position`);--> statement-breakpoint
ALTER TABLE `tasks` ADD `section_id` text;--> statement-breakpoint
ALTER TABLE `tasks` ADD `recurrence_id` text;--> statement-breakpoint
ALTER TABLE `tasks` ADD `habit_cue` text;--> statement-breakpoint
ALTER TABLE `tasks` ADD `tiny_start` text;--> statement-breakpoint
CREATE INDEX `idx_tasks_owner_recurrence_date` ON `tasks` (`owner_id`,`recurrence_id`,`date`);
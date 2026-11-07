CREATE TABLE `entries` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`kind` text NOT NULL,
	`title` text NOT NULL,
	`category` text NOT NULL,
	`amount` integer NOT NULL,
	`due_date` text NOT NULL,
	`settled_on` text,
	`recurring_id` text,
	`occurrence_month` text,
	`installment_id` text,
	`installment_number` integer,
	`deleted` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`recurring_id`,`user_id`) REFERENCES `recurring`(`id`,`user_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`installment_id`,`user_id`) REFERENCES `installments`(`id`,`user_id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "entries_kind" CHECK("entries"."kind" IN ('income','expense')),
	CONSTRAINT "entries_amount" CHECK("entries"."amount">0),
	CONSTRAINT "entries_deleted" CHECK("entries"."deleted" IN (0,1))
);
--> statement-breakpoint
CREATE INDEX `entries_user_date` ON `entries` (`user_id`,`due_date`);--> statement-breakpoint
CREATE UNIQUE INDEX `recurring_month` ON `entries` (`recurring_id`,`occurrence_month`);--> statement-breakpoint
CREATE UNIQUE INDEX `installment_part` ON `entries` (`installment_id`,`installment_number`);--> statement-breakpoint
CREATE TABLE `installments` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`title` text NOT NULL,
	`category` text NOT NULL,
	`total` integer NOT NULL,
	`count` integer NOT NULL,
	`first_due` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "installments_total" CHECK("installments"."total">0),
	CONSTRAINT "installments_count" CHECK("installments"."count" BETWEEN 2 AND 120)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `installments_owner` ON `installments` (`id`,`user_id`);--> statement-breakpoint
CREATE TABLE `rate_limits` (
	`user_id` text PRIMARY KEY NOT NULL,
	`window` integer NOT NULL,
	`counter` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `recurring` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`kind` text NOT NULL,
	`title` text NOT NULL,
	`category` text NOT NULL,
	`amount` integer NOT NULL,
	`start_date` text NOT NULL,
	`end_month` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "recurring_kind" CHECK("recurring"."kind" IN ('income','expense')),
	CONSTRAINT "recurring_positive" CHECK("recurring"."amount">0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `recurring_owner` ON `recurring` (`id`,`user_id`);--> statement-breakpoint
CREATE TABLE `reserves` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`title` text NOT NULL,
	`target` integer NOT NULL,
	`deadline` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "reserve_target" CHECK("reserves"."target">0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `reserves_owner` ON `reserves` (`id`,`user_id`);--> statement-breakpoint
CREATE TABLE `transfers` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`reserve_id` text NOT NULL,
	`amount` integer NOT NULL,
	`date` text NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`reserve_id`,`user_id`) REFERENCES `reserves`(`id`,`user_id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "transfer_amount" CHECK("transfers"."amount"!=0)
);
--> statement-breakpoint
CREATE INDEX `transfers_user` ON `transfers` (`user_id`,`reserve_id`,`date`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL
);

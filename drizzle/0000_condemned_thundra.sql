CREATE TABLE `browser_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`budget_id` text NOT NULL,
	`county` text NOT NULL,
	`status` text NOT NULL,
	`reserved_milli_usd` integer NOT NULL,
	`credits` integer,
	`spent_milli_usd` integer,
	`created_at` text NOT NULL,
	`completed_at` text
);
--> statement-breakpoint
CREATE TABLE `scrape_budgets` (
	`id` text PRIMARY KEY NOT NULL,
	`limit_milli_usd` integer NOT NULL,
	`spent_milli_usd` integer DEFAULT 0 NOT NULL,
	`reserved_milli_usd` integer DEFAULT 0 NOT NULL
);

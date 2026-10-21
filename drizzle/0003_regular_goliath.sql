CREATE TABLE `ord_push_deliveries` (
	`event_id` text NOT NULL,
	`subscription_id` text NOT NULL,
	PRIMARY KEY(`event_id`, `subscription_id`)
);
--> statement-breakpoint
CREATE TABLE `ord_push_subscriptions` (
	`id` text PRIMARY KEY NOT NULL,
	`device_id` text NOT NULL,
	`origin` text NOT NULL,
	`subscription` text NOT NULL
);

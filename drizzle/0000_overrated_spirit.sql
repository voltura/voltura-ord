CREATE TABLE `games` (
	`id` text PRIMARY KEY NOT NULL,
	`version` integer NOT NULL,
	`state` text NOT NULL,
	`player0` text NOT NULL,
	`player1` text,
	`invitation` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);

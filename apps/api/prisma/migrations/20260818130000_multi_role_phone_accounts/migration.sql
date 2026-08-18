DROP INDEX `User_phone_key` ON `User`;

CREATE UNIQUE INDEX `User_phone_role_key` ON `User`(`phone`, `role`);

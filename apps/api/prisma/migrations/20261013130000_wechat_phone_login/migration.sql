CREATE TABLE `WechatCodeUse` (
 `id` CHAR(64) NOT NULL, `kind` VARCHAR(16) NOT NULL, `requestKey` CHAR(64) NOT NULL,
 `expiresAt` DATETIME(3) NOT NULL, `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 INDEX `WechatCodeUse_requestKey_createdAt_idx`(`requestKey`,`createdAt`), INDEX `WechatCodeUse_expiresAt_idx`(`expiresAt`), PRIMARY KEY(`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

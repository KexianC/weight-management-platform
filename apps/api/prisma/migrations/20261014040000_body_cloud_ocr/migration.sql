-- Additive only: no account, original business row, upload, or existing FK is modified.
CREATE TABLE `BodyCloudOcrRequest` (
 `id` VARCHAR(191) NOT NULL, `draftId` VARCHAR(191) NOT NULL,
 `patientId` VARCHAR(191) NOT NULL, `mediaAssetId` VARCHAR(191) NOT NULL,
 `imageSha256` CHAR(64) NOT NULL, `inputSha256` CHAR(64) NOT NULL, `createdById` VARCHAR(191) NOT NULL,
 `requestKey` VARCHAR(96) NOT NULL, `inputKey` VARCHAR(700) NOT NULL,
 `state` VARCHAR(24) NOT NULL DEFAULT 'WAITING_AUTH',
 `noticeVersion` VARCHAR(32) NOT NULL, `noticeSha256` CHAR(64) NOT NULL, `noticeText` TEXT NOT NULL,
 `provider` VARCHAR(32) NOT NULL, `model` VARCHAR(64) NOT NULL, `region` VARCHAR(32) NOT NULL,
 `expiresAt` DATETIME(3) NOT NULL, `dataMinimizedAt` DATETIME(3) NOT NULL,
 `authorizedById` VARCHAR(191) NULL, `authorizedAt` DATETIME(3) NULL,
 `sentAt` DATETIME(3) NULL, `finishedAt` DATETIME(3) NULL,
 `budgetDay` CHAR(10) NULL, `reservedMicro` INTEGER NOT NULL DEFAULT 0,
 `actualMicro` INTEGER NULL, `inputTokens` INTEGER NULL, `outputTokens` INTEGER NULL,
 `errorCode` VARCHAR(32) NULL, `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), `updatedAt` DATETIME(3) NOT NULL,
 UNIQUE INDEX `BodyCloudOcrRequest_createdById_requestKey_key` (`createdById`,`requestKey`),
 INDEX `BodyCloudOcrRequest_patientId_createdAt_idx` (`patientId`,`createdAt`),
 INDEX `BodyCloudOcrRequest_draftId_state_idx` (`draftId`,`state`),
 INDEX `BodyCloudOcrRequest_state_sentAt_idx` (`state`,`sentAt`), PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE TABLE `BodyCloudOcrBudget` (
 `day` CHAR(10) NOT NULL, `limitMicro` INTEGER NOT NULL,
 `usedMicro` INTEGER NOT NULL DEFAULT 0, `heldMicro` INTEGER NOT NULL DEFAULT 0,
 `blocked` BOOLEAN NOT NULL DEFAULT false,
 `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), `updatedAt` DATETIME(3) NOT NULL,
 PRIMARY KEY (`day`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE `BodyCloudOcrRequest` ADD CONSTRAINT `BodyCloudOcrRequest_draftId_fkey` FOREIGN KEY (`draftId`) REFERENCES `OcrDraft`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

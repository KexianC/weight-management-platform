-- Additive only; preserves all previous data and relationships.
-- CreateTable
CREATE TABLE `YuanqizhanActivity` (
    `id` VARCHAR(191) NOT NULL,
    `title` VARCHAR(120) NOT NULL,
    `description` TEXT NULL,
    `durationDays` INTEGER NOT NULL DEFAULT 15,
    `status` ENUM('ACTIVE', 'ENDED') NOT NULL DEFAULT 'ACTIVE',
    `version` INTEGER NOT NULL DEFAULT 1,
    `createdById` VARCHAR(191) NOT NULL,
    `endedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `YuanqizhanActivity_status_createdAt_idx`(`status`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `YuanqizhanMember` (
    `id` VARCHAR(191) NOT NULL,
    `activityId` VARCHAR(191) NOT NULL,
    `patientId` VARCHAR(191) NOT NULL,
    `status` ENUM('ACTIVE', 'REMOVED') NOT NULL DEFAULT 'ACTIVE',
    `joinedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `startDate` CHAR(10) NOT NULL,
    `version` INTEGER NOT NULL DEFAULT 1,
    `removedAt` DATETIME(3) NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `YuanqizhanMember_patientId_status_joinedAt_idx`(`patientId`, `status`, `joinedAt`),
    INDEX `YuanqizhanMember_activityId_status_joinedAt_idx`(`activityId`, `status`, `joinedAt`),
    UNIQUE INDEX `YuanqizhanMember_activityId_patientId_key`(`activityId`, `patientId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `YuanqizhanDailyRecord` (
    `id` VARCHAR(191) NOT NULL,
    `activityId` VARCHAR(191) NOT NULL,
    `memberId` VARCHAR(191) NOT NULL,
    `patientId` VARCHAR(191) NOT NULL,
    `date` CHAR(10) NOT NULL,
    `dayNumber` INTEGER NOT NULL,
    `formType` VARCHAR(16) NOT NULL,
    `schemaVersion` VARCHAR(48) NOT NULL,
    `formSnapshot` JSON NOT NULL,
    `status` ENUM('DRAFT', 'SUBMITTED') NOT NULL DEFAULT 'DRAFT',
    `version` INTEGER NOT NULL DEFAULT 1,
    `answers` JSON NOT NULL,
    `photos` JSON NOT NULL,
    `submittedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `YuanqizhanDailyRecord_memberId_date_idx`(`memberId`, `date`),
    INDEX `YuanqizhanDailyRecord_patientId_date_idx`(`patientId`, `date`),
    UNIQUE INDEX `YuanqizhanDailyRecord_activityId_patientId_date_key`(`activityId`, `patientId`, `date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `YuanqizhanRecordRevision` (
    `id` VARCHAR(191) NOT NULL,
    `recordId` VARCHAR(191) NOT NULL,
    `memberId` VARCHAR(191) NOT NULL,
    `version` INTEGER NOT NULL,
    `status` ENUM('DRAFT', 'SUBMITTED') NOT NULL,
    `answers` JSON NOT NULL,
    `photos` JSON NOT NULL,
    `submittedAt` DATETIME(3) NULL,
    `requestKey` VARCHAR(96) NOT NULL,
    `requestFingerprint` CHAR(64) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `YuanqizhanRecordRevision_recordId_version_key`(`recordId`, `version`),
    UNIQUE INDEX `YuanqizhanRecordRevision_memberId_requestKey_key`(`memberId`, `requestKey`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `YuanqizhanPhoto` (
    `id` VARCHAR(191) NOT NULL,
    `memberId` VARCHAR(191) NOT NULL,
    `date` CHAR(10) NOT NULL,
    `slot` VARCHAR(32) NOT NULL,
    `assetId` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `YuanqizhanPhoto_assetId_key`(`assetId`),
    INDEX `YuanqizhanPhoto_memberId_date_slot_idx`(`memberId`, `date`, `slot`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `YuanqizhanMember` ADD CONSTRAINT `YuanqizhanMember_activityId_fkey` FOREIGN KEY (`activityId`) REFERENCES `YuanqizhanActivity`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `YuanqizhanMember` ADD CONSTRAINT `YuanqizhanMember_patientId_fkey` FOREIGN KEY (`patientId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `YuanqizhanDailyRecord` ADD CONSTRAINT `YuanqizhanDailyRecord_activityId_fkey` FOREIGN KEY (`activityId`) REFERENCES `YuanqizhanActivity`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `YuanqizhanDailyRecord` ADD CONSTRAINT `YuanqizhanDailyRecord_memberId_fkey` FOREIGN KEY (`memberId`) REFERENCES `YuanqizhanMember`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `YuanqizhanDailyRecord` ADD CONSTRAINT `YuanqizhanDailyRecord_patientId_fkey` FOREIGN KEY (`patientId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `YuanqizhanRecordRevision` ADD CONSTRAINT `YuanqizhanRecordRevision_recordId_fkey` FOREIGN KEY (`recordId`) REFERENCES `YuanqizhanDailyRecord`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `YuanqizhanRecordRevision` ADD CONSTRAINT `YuanqizhanRecordRevision_memberId_fkey` FOREIGN KEY (`memberId`) REFERENCES `YuanqizhanMember`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `YuanqizhanPhoto` ADD CONSTRAINT `YuanqizhanPhoto_memberId_fkey` FOREIGN KEY (`memberId`) REFERENCES `YuanqizhanMember`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `YuanqizhanPhoto` ADD CONSTRAINT `YuanqizhanPhoto_assetId_fkey` FOREIGN KEY (`assetId`) REFERENCES `MediaAsset`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

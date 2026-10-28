-- DropForeignKey
ALTER TABLE `HealthRecordReview` DROP FOREIGN KEY `HealthRecordReview_healthRecordId_fkey`;

-- DropIndex
DROP INDEX `HealthRecordReview_healthRecordId_practitionerId_key` ON `HealthRecordReview`;

-- AlterTable
ALTER TABLE `User` ADD COLUMN `initialPasswordExpiresAt` DATETIME(3) NULL,
    ADD COLUMN `mustChangePassword` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `sessionVersion` INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE `HealthRecord` ADD COLUMN `caloriesSource` VARCHAR(32) NULL,
    ADD COLUMN `hipCm` DECIMAL(5, 2) NULL,
    ADD COLUMN `requestFingerprint` VARCHAR(64) NULL,
    ADD COLUMN `requestKey` VARCHAR(64) NULL,
    ADD COLUMN `sleepHours` DECIMAL(4, 2) NULL,
    MODIFY `recordType` ENUM('WEIGHT', 'DIET', 'EXERCISE', 'MEDICATION', 'QUESTIONNAIRE', 'GENERAL', 'BLOOD_PRESSURE', 'SYMPTOM', 'SLEEP') NOT NULL DEFAULT 'WEIGHT';

-- AlterTable
ALTER TABLE `BodyAssessment` ADD COLUMN `hipCm` DOUBLE NULL,
    ADD COLUMN `skeletalMuscleMassKg` DOUBLE NULL,
    ADD COLUMN `source` VARCHAR(32) NOT NULL DEFAULT 'MANUAL',
    ADD COLUMN `sourceDraftId` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `PosturePhoto` ADD COLUMN `faceProtected` BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE `ExerciseVideo` ADD COLUMN `active` BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN `archivedAt` DATETIME(3) NULL,
    ADD COLUMN `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3);

-- AlterTable
ALTER TABLE `ExercisePrescription` ADD COLUMN `reviewedAt` DATETIME(3) NULL,
    ADD COLUMN `reviewedById` VARCHAR(191) NULL,
    ADD COLUMN `revisedFromId` VARCHAR(191) NULL,
    ADD COLUMN `version` INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE `ExerciseReportShare` ADD COLUMN `requestKey` VARCHAR(64) NULL;

-- CreateTable
CREATE TABLE `HealthRecordReviewReply` (
    `id` VARCHAR(191) NOT NULL,
    `reviewId` VARCHAR(191) NOT NULL,
    `patientId` VARCHAR(191) NOT NULL,
    `comment` TEXT NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `HealthRecordReviewReply_reviewId_createdAt_idx`(`reviewId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `HealthReportDocument` (
    `id` VARCHAR(191) NOT NULL,
    `patientId` VARCHAR(191) NOT NULL,
    `mediaAssetId` VARCHAR(191) NOT NULL,
    `category` VARCHAR(32) NOT NULL,
    `title` VARCHAR(120) NOT NULL,
    `createdById` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `HealthReportDocument_mediaAssetId_key`(`mediaAssetId`),
    INDEX `HealthReportDocument_patientId_category_createdAt_idx`(`patientId`, `category`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ConsentDocument` (
    `id` VARCHAR(191) NOT NULL,
    `patientId` VARCHAR(191) NOT NULL,
    `mediaAssetId` VARCHAR(191) NOT NULL,
    `version` VARCHAR(32) NOT NULL,
    `createdById` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `ConsentDocument_mediaAssetId_key`(`mediaAssetId`),
    INDEX `ConsentDocument_patientId_createdAt_idx`(`patientId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `OcrDraft` (
    `id` VARCHAR(191) NOT NULL,
    `patientId` VARCHAR(191) NOT NULL,
    `mediaAssetId` VARCHAR(191) NOT NULL,
    `provider` VARCHAR(32) NOT NULL,
    `status` VARCHAR(32) NOT NULL DEFAULT 'DRAFT',
    `fields` JSON NOT NULL,
    `sourceKind` VARCHAR(32) NOT NULL,
    `measuredAt` DATETIME(3) NULL,
    `errorMessage` VARCHAR(500) NULL,
    `createdById` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `confirmedAt` DATETIME(3) NULL,
    `bodyAssessmentId` VARCHAR(191) NULL,

    UNIQUE INDEX `OcrDraft_mediaAssetId_key`(`mediaAssetId`),
    UNIQUE INDEX `OcrDraft_bodyAssessmentId_key`(`bodyAssessmentId`),
    INDEX `OcrDraft_patientId_createdAt_idx`(`patientId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE UNIQUE INDEX `HealthRecord_requestKey_key` ON `HealthRecord`(`requestKey`);

-- CreateIndex
CREATE UNIQUE INDEX `BodyAssessment_sourceDraftId_key` ON `BodyAssessment`(`sourceDraftId`);

-- CreateIndex
CREATE UNIQUE INDEX `ExerciseReportShare_requestKey_key` ON `ExerciseReportShare`(`requestKey`);

-- AddForeignKey
ALTER TABLE `HealthRecordReview` ADD CONSTRAINT `HealthRecordReview_healthRecordId_fkey` FOREIGN KEY (`healthRecordId`) REFERENCES `HealthRecord`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `HealthRecordReviewReply` ADD CONSTRAINT `HealthRecordReviewReply_reviewId_fkey` FOREIGN KEY (`reviewId`) REFERENCES `HealthRecordReview`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `HealthRecordReviewReply` ADD CONSTRAINT `HealthRecordReviewReply_patientId_fkey` FOREIGN KEY (`patientId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `HealthReportDocument` ADD CONSTRAINT `HealthReportDocument_patientId_fkey` FOREIGN KEY (`patientId`) REFERENCES `CareEnrollment`(`patientId`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `HealthReportDocument` ADD CONSTRAINT `HealthReportDocument_mediaAssetId_fkey` FOREIGN KEY (`mediaAssetId`) REFERENCES `MediaAsset`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `HealthReportDocument` ADD CONSTRAINT `HealthReportDocument_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ConsentDocument` ADD CONSTRAINT `ConsentDocument_patientId_fkey` FOREIGN KEY (`patientId`) REFERENCES `CareEnrollment`(`patientId`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ConsentDocument` ADD CONSTRAINT `ConsentDocument_mediaAssetId_fkey` FOREIGN KEY (`mediaAssetId`) REFERENCES `MediaAsset`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ConsentDocument` ADD CONSTRAINT `ConsentDocument_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `OcrDraft` ADD CONSTRAINT `OcrDraft_patientId_fkey` FOREIGN KEY (`patientId`) REFERENCES `CareEnrollment`(`patientId`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `OcrDraft` ADD CONSTRAINT `OcrDraft_mediaAssetId_fkey` FOREIGN KEY (`mediaAssetId`) REFERENCES `MediaAsset`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `OcrDraft` ADD CONSTRAINT `OcrDraft_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE `User` MODIFY `role` ENUM('PATIENT', 'DOCTOR', 'NUTRITIONIST', 'HEALTH_MANAGER', 'EXERCISE_COACH', 'ADMIN') NOT NULL;

-- CreateTable
CREATE TABLE `CareEnrollment` (
    `id` VARCHAR(191) NOT NULL,
    `patientId` VARCHAR(191) NOT NULL,
    `clientCode` VARCHAR(32) NOT NULL,
    `packageName` VARCHAR(120) NOT NULL,
    `healthManagerId` VARCHAR(191) NOT NULL,
    `nutritionistId` VARCHAR(191) NOT NULL,
    `doctorId` VARCHAR(191) NOT NULL,
    `exerciseCoachId` VARCHAR(191) NOT NULL,
    `lifestyle` JSON NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `CareEnrollment_patientId_key`(`patientId`),
    UNIQUE INDEX `CareEnrollment_clientCode_key`(`clientCode`),
    INDEX `CareEnrollment_healthManagerId_createdAt_idx`(`healthManagerId`, `createdAt`),
    INDEX `CareEnrollment_nutritionistId_createdAt_idx`(`nutritionistId`, `createdAt`),
    INDEX `CareEnrollment_doctorId_createdAt_idx`(`doctorId`, `createdAt`),
    INDEX `CareEnrollment_exerciseCoachId_createdAt_idx`(`exerciseCoachId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `BodyAssessment` (
    `id` VARCHAR(191) NOT NULL,
    `patientId` VARCHAR(191) NOT NULL,
    `createdById` VARCHAR(191) NOT NULL,
    `measuredAt` DATETIME(3) NOT NULL,
    `heightCm` DOUBLE NULL,
    `weightKg` DOUBLE NULL,
    `bodyFatPct` DOUBLE NULL,
    `muscleMassKg` DOUBLE NULL,
    `waistCm` DOUBLE NULL,
    `bmi` DOUBLE NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `BodyAssessment_patientId_measuredAt_idx`(`patientId`, `measuredAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PosturePhoto` (
    `id` VARCHAR(191) NOT NULL,
    `patientId` VARCHAR(191) NOT NULL,
    `mediaAssetId` VARCHAR(191) NOT NULL,
    `view` VARCHAR(16) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `PosturePhoto_mediaAssetId_key`(`mediaAssetId`),
    INDEX `PosturePhoto_patientId_createdAt_idx`(`patientId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ExerciseVideo` (
    `id` VARCHAR(191) NOT NULL,
    `title` VARCHAR(120) NOT NULL,
    `description` VARCHAR(500) NULL,
    `mediaAssetId` VARCHAR(191) NOT NULL,
    `durationSeconds` INTEGER NOT NULL,
    `createdById` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `ExerciseVideo_mediaAssetId_key`(`mediaAssetId`),
    INDEX `ExerciseVideo_createdAt_idx`(`createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ExercisePrescription` (
    `id` VARCHAR(191) NOT NULL,
    `patientId` VARCHAR(191) NOT NULL,
    `coachId` VARCHAR(191) NOT NULL,
    `assessment` TEXT NOT NULL,
    `precautions` TEXT NULL,
    `items` JSON NOT NULL,
    `publishedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `ExercisePrescription_patientId_createdAt_idx`(`patientId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ExerciseReportShare` (
    `id` VARCHAR(191) NOT NULL,
    `reportId` VARCHAR(191) NOT NULL,
    `nutritionistId` VARCHAR(191) NOT NULL,
    `tokenHash` VARCHAR(64) NOT NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `revokedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `ExerciseReportShare_tokenHash_key`(`tokenHash`),
    INDEX `ExerciseReportShare_reportId_expiresAt_revokedAt_idx`(`reportId`, `expiresAt`, `revokedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `CareEnrollment` ADD CONSTRAINT `CareEnrollment_patientId_fkey` FOREIGN KEY (`patientId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CareEnrollment` ADD CONSTRAINT `CareEnrollment_healthManagerId_fkey` FOREIGN KEY (`healthManagerId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CareEnrollment` ADD CONSTRAINT `CareEnrollment_nutritionistId_fkey` FOREIGN KEY (`nutritionistId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CareEnrollment` ADD CONSTRAINT `CareEnrollment_doctorId_fkey` FOREIGN KEY (`doctorId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CareEnrollment` ADD CONSTRAINT `CareEnrollment_exerciseCoachId_fkey` FOREIGN KEY (`exerciseCoachId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `BodyAssessment` ADD CONSTRAINT `BodyAssessment_patientId_fkey` FOREIGN KEY (`patientId`) REFERENCES `CareEnrollment`(`patientId`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `BodyAssessment` ADD CONSTRAINT `BodyAssessment_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PosturePhoto` ADD CONSTRAINT `PosturePhoto_patientId_fkey` FOREIGN KEY (`patientId`) REFERENCES `CareEnrollment`(`patientId`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PosturePhoto` ADD CONSTRAINT `PosturePhoto_mediaAssetId_fkey` FOREIGN KEY (`mediaAssetId`) REFERENCES `MediaAsset`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ExerciseVideo` ADD CONSTRAINT `ExerciseVideo_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ExerciseVideo` ADD CONSTRAINT `ExerciseVideo_mediaAssetId_fkey` FOREIGN KEY (`mediaAssetId`) REFERENCES `MediaAsset`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ExercisePrescription` ADD CONSTRAINT `ExercisePrescription_patientId_fkey` FOREIGN KEY (`patientId`) REFERENCES `CareEnrollment`(`patientId`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ExercisePrescription` ADD CONSTRAINT `ExercisePrescription_coachId_fkey` FOREIGN KEY (`coachId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ExerciseReportShare` ADD CONSTRAINT `ExerciseReportShare_reportId_fkey` FOREIGN KEY (`reportId`) REFERENCES `ExercisePrescription`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ExerciseReportShare` ADD CONSTRAINT `ExerciseReportShare_nutritionistId_fkey` FOREIGN KEY (`nutritionistId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

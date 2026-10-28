CREATE TABLE `HealthRecordReview` (
  `id` VARCHAR(191) NOT NULL,
  `healthRecordId` VARCHAR(191) NOT NULL,
  `practitionerId` VARCHAR(191) NOT NULL,
  `comment` TEXT NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `HealthRecordReview_healthRecordId_practitionerId_key` (`healthRecordId`, `practitionerId`),
  INDEX `HealthRecordReview_healthRecordId_updatedAt_idx` (`healthRecordId`, `updatedAt`),
  INDEX `HealthRecordReview_practitionerId_updatedAt_idx` (`practitionerId`, `updatedAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `DietPlanTemplate` (
  `id` VARCHAR(191) NOT NULL,
  `title` VARCHAR(120) NOT NULL,
  `summary` VARCHAR(500) NULL,
  `content` JSON NOT NULL,
  `dailyCaloriesKcal` INTEGER NULL,
  `durationDays` INTEGER NULL,
  `active` BOOLEAN NOT NULL DEFAULT true,
  `createdById` VARCHAR(191) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  INDEX `DietPlanTemplate_active_updatedAt_idx` (`active`, `updatedAt`),
  INDEX `DietPlanTemplate_createdById_idx` (`createdById`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `DietPlan` (
  `id` VARCHAR(191) NOT NULL,
  `patientId` VARCHAR(191) NOT NULL,
  `practitionerId` VARCHAR(191) NOT NULL,
  `templateId` VARCHAR(191) NULL,
  `title` VARCHAR(120) NOT NULL,
  `summary` VARCHAR(500) NULL,
  `content` JSON NOT NULL,
  `instructions` TEXT NULL,
  `status` ENUM('ACTIVE', 'ENDED') NOT NULL DEFAULT 'ACTIVE',
  `startsAt` DATETIME(3) NOT NULL,
  `endsAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  INDEX `DietPlan_patientId_status_startsAt_idx` (`patientId`, `status`, `startsAt`),
  INDEX `DietPlan_practitionerId_status_createdAt_idx` (`practitionerId`, `status`, `createdAt`),
  INDEX `DietPlan_templateId_idx` (`templateId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `HealthRecordReview`
  ADD CONSTRAINT `HealthRecordReview_healthRecordId_fkey`
  FOREIGN KEY (`healthRecordId`) REFERENCES `HealthRecord`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `HealthRecordReview_practitionerId_fkey`
  FOREIGN KEY (`practitionerId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `DietPlanTemplate`
  ADD CONSTRAINT `DietPlanTemplate_createdById_fkey`
  FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `DietPlan`
  ADD CONSTRAINT `DietPlan_patientId_fkey`
  FOREIGN KEY (`patientId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `DietPlan_practitionerId_fkey`
  FOREIGN KEY (`practitionerId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `DietPlan_templateId_fkey`
  FOREIGN KEY (`templateId`) REFERENCES `DietPlanTemplate`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

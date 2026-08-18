CREATE TABLE `CareSummary` (
  `id` VARCHAR(191) NOT NULL,
  `patientId` VARCHAR(191) NOT NULL,
  `practitionerId` VARCHAR(191) NOT NULL,
  `periodType` ENUM('WEEKLY', 'MONTHLY') NOT NULL,
  `periodStart` DATETIME(3) NOT NULL,
  `periodEnd` DATETIME(3) NOT NULL,
  `metrics` JSON NOT NULL,
  `comment` TEXT NOT NULL,
  `publishedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `CareSummary_patientId_practitionerId_periodType_periodStart_key` (`patientId`, `practitionerId`, `periodType`, `periodStart`),
  INDEX `CareSummary_patientId_publishedAt_idx` (`patientId`, `publishedAt`),
  INDEX `CareSummary_practitionerId_publishedAt_idx` (`practitionerId`, `publishedAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `CareSummary`
  ADD CONSTRAINT `CareSummary_patientId_fkey`
  FOREIGN KEY (`patientId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `CareSummary`
  ADD CONSTRAINT `CareSummary_practitionerId_fkey`
  FOREIGN KEY (`practitionerId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

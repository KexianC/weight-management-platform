-- Additive: existing Yuanqizhan activities and health records are preserved.
CREATE TABLE `DailyCheckInLink` (
  `id` VARCHAR(191) NOT NULL,
  `patientId` VARCHAR(191) NOT NULL,
  `nonce` VARCHAR(43) NOT NULL,
  `tokenHash` CHAR(64) NOT NULL,
  `revokedAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `DailyCheckInLink_patientId_key` (`patientId`),
  UNIQUE INDEX `DailyCheckInLink_tokenHash_key` (`tokenHash`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `DailyCheckInRecord` (
  `id` VARCHAR(191) NOT NULL,
  `patientId` VARCHAR(191) NOT NULL,
  `date` CHAR(10) NOT NULL,
  `version` INTEGER NOT NULL DEFAULT 1,
  `weightKg` DECIMAL(5, 2) NOT NULL,
  `answers` JSON NOT NULL,
  `healthRecordId` VARCHAR(191) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `DailyCheckInRecord_healthRecordId_key` (`healthRecordId`),
  UNIQUE INDEX `DailyCheckInRecord_patientId_date_key` (`patientId`, `date`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `DailyCheckInLink` ADD CONSTRAINT `DailyCheckInLink_patientId_fkey` FOREIGN KEY (`patientId`) REFERENCES `User` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `DailyCheckInRecord` ADD CONSTRAINT `DailyCheckInRecord_patientId_fkey` FOREIGN KEY (`patientId`) REFERENCES `User` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `DailyCheckInRecord` ADD CONSTRAINT `DailyCheckInRecord_healthRecordId_fkey` FOREIGN KEY (`healthRecordId`) REFERENCES `HealthRecord` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

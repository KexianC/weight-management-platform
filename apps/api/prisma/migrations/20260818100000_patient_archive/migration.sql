CREATE TABLE `PatientArchive` (
  `id` VARCHAR(191) NOT NULL,
  `patientId` VARCHAR(191) NOT NULL,
  `status` ENUM('DRAFT','COMPLETED') NOT NULL DEFAULT 'DRAFT',
  `templateVersion` VARCHAR(40) NOT NULL DEFAULT 'TCM_WEIGHT_V1',
  `answers` JSON NOT NULL,
  `completionPercent` TINYINT UNSIGNED NOT NULL DEFAULT 0,
  `createdById` VARCHAR(191) NOT NULL,
  `updatedById` VARCHAR(191) NOT NULL,
  `completedAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `PatientArchive_patientId_key`(`patientId`),
  INDEX `PatientArchive_status_updatedAt_idx`(`status`,`updatedAt`),
  INDEX `PatientArchive_createdById_idx`(`createdById`),
  INDEX `PatientArchive_updatedById_idx`(`updatedById`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `PatientArchive` ADD CONSTRAINT `PatientArchive_patientId_fkey` FOREIGN KEY (`patientId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `PatientArchive` ADD CONSTRAINT `PatientArchive_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `PatientArchive` ADD CONSTRAINT `PatientArchive_updatedById_fkey` FOREIGN KEY (`updatedById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- Extend users for independent identity, profile and account lifecycle management.
ALTER TABLE `User`
  MODIFY `passwordHash` VARCHAR(255) NULL,
  ADD COLUMN `email` VARCHAR(191) NULL,
  ADD COLUMN `avatarUrl` VARCHAR(500) NULL,
  ADD COLUMN `lastLoginAt` DATETIME(3) NULL,
  ADD COLUMN `disabledAt` DATETIME(3) NULL,
  ADD UNIQUE INDEX `User_email_key`(`email`);

CREATE TABLE `PatientProfile` (
  `id` VARCHAR(191) NOT NULL,
  `userId` VARCHAR(191) NOT NULL,
  `gender` ENUM('UNKNOWN','MALE','FEMALE','OTHER') NOT NULL DEFAULT 'UNKNOWN',
  `birthDate` DATETIME(3) NULL,
  `heightCm` DECIMAL(5,2) NULL,
  `targetWeightKg` DECIMAL(5,2) NULL,
  `initialWeightKg` DECIMAL(5,2) NULL,
  `medicalHistory` JSON NULL,
  `allergies` JSON NULL,
  `emergencyContactName` VARCHAR(80) NULL,
  `emergencyContactPhone` VARCHAR(32) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `PatientProfile_userId_key`(`userId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `PractitionerProfile` (
  `id` VARCHAR(191) NOT NULL,
  `userId` VARCHAR(191) NOT NULL,
  `hospital` VARCHAR(160) NULL,
  `department` VARCHAR(120) NULL,
  `title` VARCHAR(120) NULL,
  `specialty` VARCHAR(500) NULL,
  `licenseNumber` VARCHAR(80) NULL,
  `introduction` TEXT NULL,
  `verifiedAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `PractitionerProfile_userId_key`(`userId`),
  UNIQUE INDEX `PractitionerProfile_licenseNumber_key`(`licenseNumber`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `AuthIdentity` (
  `id` VARCHAR(191) NOT NULL,
  `userId` VARCHAR(191) NOT NULL,
  `provider` ENUM('WECHAT_MINI_PROGRAM','WECHAT_OPEN') NOT NULL,
  `externalId` VARCHAR(191) NOT NULL,
  `unionId` VARCHAR(191) NULL,
  `metadata` JSON NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  INDEX `AuthIdentity_unionId_idx`(`unionId`),
  UNIQUE INDEX `AuthIdentity_provider_externalId_key`(`provider`,`externalId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `SmsChallenge` (
  `id` VARCHAR(191) NOT NULL,
  `phone` VARCHAR(32) NOT NULL,
  `purpose` ENUM('REGISTER','LOGIN','RESET_PASSWORD','VERIFY_PHONE') NOT NULL,
  `codeHash` VARCHAR(64) NOT NULL,
  `attempts` INTEGER NOT NULL DEFAULT 0,
  `maxAttempts` INTEGER NOT NULL DEFAULT 5,
  `expiresAt` DATETIME(3) NOT NULL,
  `verifiedAt` DATETIME(3) NULL,
  `usedAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX `SmsChallenge_phone_purpose_createdAt_idx`(`phone`,`purpose`,`createdAt`),
  INDEX `SmsChallenge_expiresAt_idx`(`expiresAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `CareInvite` (
  `id` VARCHAR(191) NOT NULL,
  `code` VARCHAR(40) NOT NULL,
  `practitionerId` VARCHAR(191) NOT NULL,
  `expiresAt` DATETIME(3) NOT NULL,
  `maxUses` INTEGER NOT NULL DEFAULT 1,
  `useCount` INTEGER NOT NULL DEFAULT 0,
  `status` ENUM('ACTIVE','REVOKED','EXPIRED') NOT NULL DEFAULT 'ACTIVE',
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `CareInvite_code_key`(`code`),
  INDEX `CareInvite_practitionerId_status_expiresAt_idx`(`practitionerId`,`status`,`expiresAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `CareRelation`
  ADD COLUMN `inviteId` VARCHAR(191) NULL,
  ADD COLUMN `bindMethod` VARCHAR(32) NOT NULL DEFAULT 'INVITE',
  ADD COLUMN `note` VARCHAR(500) NULL,
  ADD COLUMN `lastContactAt` DATETIME(3) NULL,
  ADD COLUMN `updatedAt` DATETIME(3) NULL,
  ADD COLUMN `endedReason` VARCHAR(500) NULL;
UPDATE `CareRelation` SET `updatedAt` = `createdAt` WHERE `updatedAt` IS NULL;
ALTER TABLE `CareRelation` MODIFY `updatedAt` DATETIME(3) NOT NULL;
CREATE INDEX `CareRelation_patientId_status_idx` ON `CareRelation`(`patientId`,`status`);
CREATE INDEX `CareRelation_inviteId_idx` ON `CareRelation`(`inviteId`);

ALTER TABLE `HealthRecord`
  MODIFY `weightKg` DECIMAL(5,2) NULL,
  ADD COLUMN `recordType` ENUM('WEIGHT','DIET','EXERCISE','MEDICATION','QUESTIONNAIRE','GENERAL','BLOOD_PRESSURE','SYMPTOM') NOT NULL DEFAULT 'WEIGHT',
  ADD COLUMN `mealType` ENUM('BREAKFAST','LUNCH','DINNER','SNACK') NULL,
  ADD COLUMN `mealItems` JSON NULL,
  ADD COLUMN `caloriesKcal` DECIMAL(8,2) NULL,
  ADD COLUMN `imageUrls` JSON NULL,
  ADD COLUMN `payload` JSON NULL,
  ADD COLUMN `updatedAt` DATETIME(3) NULL;
UPDATE `HealthRecord` SET `updatedAt` = `createdAt` WHERE `updatedAt` IS NULL;
ALTER TABLE `HealthRecord` MODIFY `updatedAt` DATETIME(3) NOT NULL;
CREATE INDEX `HealthRecord_patientId_recordType_measuredAt_idx` ON `HealthRecord`(`patientId`,`recordType`,`measuredAt`);

ALTER TABLE `PatientTask`
  MODIFY `status` ENUM('PENDING','IN_PROGRESS','COMPLETED','CANCELLED','OVERDUE') NOT NULL DEFAULT 'PENDING',
  ADD COLUMN `taskType` ENUM('WEIGHT','DIET','EXERCISE','MEDICATION','QUESTIONNAIRE','GENERAL') NOT NULL DEFAULT 'GENERAL',
  ADD COLUMN `priority` ENUM('LOW','NORMAL','HIGH','URGENT') NOT NULL DEFAULT 'NORMAL',
  ADD COLUMN `content` JSON NULL,
  ADD COLUMN `result` JSON NULL,
  ADD COLUMN `recurrenceRule` JSON NULL,
  ADD COLUMN `cancelledAt` DATETIME(3) NULL,
  ADD COLUMN `updatedAt` DATETIME(3) NULL;
UPDATE `PatientTask` SET `updatedAt` = `createdAt` WHERE `updatedAt` IS NULL;
ALTER TABLE `PatientTask` MODIFY `updatedAt` DATETIME(3) NOT NULL;
CREATE INDEX `PatientTask_assignedById_status_dueAt_idx` ON `PatientTask`(`assignedById`,`status`,`dueAt`);

ALTER TABLE `Message`
  ADD COLUMN `type` ENUM('TEXT','IMAGE','FILE','SYSTEM','HEALTH_RECORD') NOT NULL DEFAULT 'TEXT',
  ADD COLUMN `attachments` JSON NULL,
  ADD COLUMN `contextType` VARCHAR(50) NULL,
  ADD COLUMN `contextId` VARCHAR(80) NULL,
  ADD COLUMN `deletedBySenderAt` DATETIME(3) NULL,
  ADD COLUMN `deletedByReceiverAt` DATETIME(3) NULL,
  ADD COLUMN `updatedAt` DATETIME(3) NULL;
UPDATE `Message` SET `updatedAt` = `createdAt` WHERE `updatedAt` IS NULL;
ALTER TABLE `Message` MODIFY `updatedAt` DATETIME(3) NOT NULL;
CREATE INDEX `Message_receiverId_readAt_createdAt_idx` ON `Message`(`receiverId`,`readAt`,`createdAt`);

ALTER TABLE `RefreshToken`
  ADD COLUMN `familyId` VARCHAR(64) NULL,
  ADD COLUMN `replacedById` VARCHAR(191) NULL,
  ADD COLUMN `lastUsedAt` DATETIME(3) NULL,
  ADD COLUMN `userAgent` VARCHAR(500) NULL,
  ADD COLUMN `ipAddress` VARCHAR(64) NULL;
UPDATE `RefreshToken` SET `familyId` = `id` WHERE `familyId` IS NULL;
ALTER TABLE `RefreshToken` MODIFY `familyId` VARCHAR(64) NOT NULL;
CREATE UNIQUE INDEX `RefreshToken_tokenHash_key` ON `RefreshToken`(`tokenHash`);
CREATE INDEX `RefreshToken_familyId_revokedAt_idx` ON `RefreshToken`(`familyId`,`revokedAt`);

ALTER TABLE `FollowUp`
  MODIFY `status` ENUM('SCHEDULED','IN_PROGRESS','COMPLETED','CANCELLED','OVERDUE') NOT NULL DEFAULT 'SCHEDULED',
  ADD COLUMN `type` ENUM('WEIGHT','DIET','EXERCISE','MEDICATION','QUESTIONNAIRE','GENERAL','OFFLINE','PHONE') NOT NULL DEFAULT 'GENERAL',
  ADD COLUMN `priority` ENUM('LOW','NORMAL','HIGH','URGENT') NOT NULL DEFAULT 'NORMAL',
  ADD COLUMN `note` TEXT NULL,
  ADD COLUMN `instructions` TEXT NULL,
  ADD COLUMN `result` JSON NULL,
  ADD COLUMN `recurrenceSeriesId` VARCHAR(191) NULL,
  ADD COLUMN `recurrenceRule` JSON NULL,
  ADD COLUMN `occurrenceIndex` INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN `startedAt` DATETIME(3) NULL,
  ADD COLUMN `completedAt` DATETIME(3) NULL,
  ADD COLUMN `cancelledAt` DATETIME(3) NULL;
CREATE INDEX `FollowUp_recurrenceSeriesId_occurrenceIndex_idx` ON `FollowUp`(`recurrenceSeriesId`,`occurrenceIndex`);

ALTER TABLE `Notification`
  ADD COLUMN `type` ENUM('GENERAL','FOLLOW_UP','MESSAGE','TASK','HEALTH_ALERT','RELATION','SYSTEM') NOT NULL DEFAULT 'GENERAL',
  ADD COLUMN `priority` ENUM('LOW','NORMAL','HIGH','URGENT') NOT NULL DEFAULT 'NORMAL',
  ADD COLUMN `relatedType` VARCHAR(50) NULL,
  ADD COLUMN `relatedId` VARCHAR(80) NULL,
  ADD COLUMN `actionPath` VARCHAR(500) NULL,
  ADD COLUMN `metadata` JSON NULL,
  ADD COLUMN `expiresAt` DATETIME(3) NULL,
  ADD COLUMN `updatedAt` DATETIME(3) NULL;
UPDATE `Notification` SET `updatedAt` = `createdAt` WHERE `updatedAt` IS NULL;
ALTER TABLE `Notification` MODIFY `updatedAt` DATETIME(3) NOT NULL;
CREATE INDEX `Notification_userId_type_createdAt_idx` ON `Notification`(`userId`,`type`,`createdAt`);

CREATE TABLE `MediaAsset` (
  `id` VARCHAR(191) NOT NULL,
  `ownerId` VARCHAR(191) NOT NULL,
  `healthRecordId` VARCHAR(191) NULL,
  `provider` VARCHAR(32) NOT NULL DEFAULT 'ALIYUN_OSS',
  `bucket` VARCHAR(191) NULL,
  `objectKey` VARCHAR(500) NOT NULL,
  `url` VARCHAR(1000) NULL,
  `mimeType` VARCHAR(120) NOT NULL,
  `sizeBytes` BIGINT NULL,
  `sha256` VARCHAR(64) NULL,
  `scope` VARCHAR(50) NOT NULL DEFAULT 'GENERAL',
  `referenceType` VARCHAR(50) NULL,
  `referenceId` VARCHAR(191) NULL,
  `status` ENUM('PENDING','READY','DELETED','FAILED') NOT NULL DEFAULT 'PENDING',
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  `deletedAt` DATETIME(3) NULL,
  UNIQUE INDEX `MediaAsset_objectKey_key`(`objectKey`),
  INDEX `MediaAsset_ownerId_status_createdAt_idx`(`ownerId`,`status`,`createdAt`),
  INDEX `MediaAsset_referenceType_referenceId_idx`(`referenceType`,`referenceId`),
  INDEX `MediaAsset_healthRecordId_idx`(`healthRecordId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `CalorieEstimate` (
  `id` VARCHAR(191) NOT NULL,
  `userId` VARCHAR(191) NOT NULL,
  `foodName` VARCHAR(191) NULL,
  `amountGrams` DECIMAL(8,2) NULL,
  `estimatedKcal` DECIMAL(8,2) NULL,
  `source` VARCHAR(50) NOT NULL DEFAULT 'RULE',
  `inputText` TEXT NULL,
  `imageUrl` VARCHAR(1000) NULL,
  `result` JSON NULL,
  `provider` VARCHAR(80) NULL,
  `model` VARCHAR(120) NULL,
  `confidence` DECIMAL(5,4) NULL,
  `status` ENUM('PENDING','COMPLETED','FAILED') NOT NULL DEFAULT 'PENDING',
  `errorMessage` VARCHAR(500) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  INDEX `CalorieEstimate_userId_createdAt_idx`(`userId`,`createdAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `PatientProfile` ADD CONSTRAINT `PatientProfile_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `PractitionerProfile` ADD CONSTRAINT `PractitionerProfile_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `AuthIdentity` ADD CONSTRAINT `AuthIdentity_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `CareInvite` ADD CONSTRAINT `CareInvite_practitionerId_fkey` FOREIGN KEY (`practitionerId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `CareRelation` ADD CONSTRAINT `CareRelation_inviteId_fkey` FOREIGN KEY (`inviteId`) REFERENCES `CareInvite`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `MediaAsset` ADD CONSTRAINT `MediaAsset_ownerId_fkey` FOREIGN KEY (`ownerId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `MediaAsset` ADD CONSTRAINT `MediaAsset_healthRecordId_fkey` FOREIGN KEY (`healthRecordId`) REFERENCES `HealthRecord`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `CalorieEstimate` ADD CONSTRAINT `CalorieEstimate_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

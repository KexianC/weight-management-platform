ALTER TABLE `PatientArchive` ADD COLUMN `archiveNo` VARCHAR(32) NULL;

UPDATE `PatientArchive`
SET `archiveNo` = CONCAT('TCM', DATE_FORMAT(`createdAt`, '%Y%m%d'), UPPER(SUBSTRING(SHA2(`id`, 256), 1, 12)))
WHERE `archiveNo` IS NULL;

ALTER TABLE `PatientArchive` MODIFY `archiveNo` VARCHAR(32) NOT NULL;
CREATE UNIQUE INDEX `PatientArchive_archiveNo_key` ON `PatientArchive`(`archiveNo`);

ALTER TABLE `User`
  ADD COLUMN `practitionerPhone` VARCHAR(32) NULL;

UPDATE `User`
SET `practitionerPhone` = `phone`
WHERE `role` IN ('DOCTOR', 'NUTRITIONIST');

-- Existing duplicate practitioner phones intentionally make this migration fail.
-- Resolve the duplicate identities before retrying; choosing one account automatically
-- could orphan clinical records and care relationships.
CREATE UNIQUE INDEX `User_practitionerPhone_key` ON `User`(`practitionerPhone`);

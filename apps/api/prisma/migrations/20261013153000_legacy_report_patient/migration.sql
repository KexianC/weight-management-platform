-- Patient-owned original reports do not require managed-care enrollment.
-- All existing enrollment.patientId values already reference User.id.
-- No data, columns, account, assignment, consent/OCR or share relationship is changed.
ALTER TABLE `HealthReportDocument`
  DROP FOREIGN KEY `HealthReportDocument_patientId_fkey`,
  ADD CONSTRAINT `HealthReportDocument_patientId_user_fkey`
    FOREIGN KEY (`patientId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

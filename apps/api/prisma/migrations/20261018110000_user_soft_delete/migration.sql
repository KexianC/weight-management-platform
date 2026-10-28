-- Preserve accounts, service relationships, health records and original media.
-- Only the account lifecycle gains a terminal soft-deleted state.
ALTER TABLE `User`
  MODIFY COLUMN `status` ENUM('ACTIVE', 'DISABLED', 'DELETED') NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN `deletedAt` DATETIME(3) NULL;

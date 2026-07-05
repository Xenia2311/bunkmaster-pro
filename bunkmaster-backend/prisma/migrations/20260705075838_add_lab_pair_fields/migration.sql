-- AlterTable
ALTER TABLE "TimetableLabSlot" ADD COLUMN     "isLabPair" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "pairedSlotIndex" INTEGER;

/*
  Warnings:

  - You are about to drop the column `name` on the `Section` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[branch,year]` on the table `Section` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `branch` to the `Section` table without a default value. This is not possible if the table is not empty.
  - Added the required column `year` to the `Section` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "Branch" AS ENUM ('CST', 'CS', 'IT', 'AI', 'DS', 'ENC');

-- CreateEnum
CREATE TYPE "AcademicYear" AS ENUM ('First', 'Second', 'Third', 'Fourth');

-- CreateEnum
CREATE TYPE "AnnouncementType" AS ENUM ('test', 'quiz', 'assignment', 'notice', 'holiday');

-- AlterTable
ALTER TABLE "Section" DROP COLUMN "name",
ADD COLUMN     "branch" "Branch" NOT NULL,
ADD COLUMN     "year" "AcademicYear" NOT NULL;

-- CreateTable
CREATE TABLE "Announcement" (
    "id" TEXT NOT NULL,
    "sectionId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "type" "AnnouncementType" NOT NULL DEFAULT 'notice',
    "date" DATE NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Announcement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExtraLecture" (
    "id" TEXT NOT NULL,
    "sectionId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "reason" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExtraLecture_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Announcement_sectionId_date_idx" ON "Announcement"("sectionId", "date");

-- CreateIndex
CREATE INDEX "ExtraLecture_sectionId_idx" ON "ExtraLecture"("sectionId");

-- CreateIndex
CREATE UNIQUE INDEX "ExtraLecture_sectionId_subjectId_date_key" ON "ExtraLecture"("sectionId", "subjectId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "Section_branch_year_key" ON "Section"("branch", "year");

-- AddForeignKey
ALTER TABLE "Announcement" ADD CONSTRAINT "Announcement_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "Section"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Announcement" ADD CONSTRAINT "Announcement_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExtraLecture" ADD CONSTRAINT "ExtraLecture_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "Section"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExtraLecture" ADD CONSTRAINT "ExtraLecture_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExtraLecture" ADD CONSTRAINT "ExtraLecture_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

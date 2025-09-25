-- AlterEnum
ALTER TYPE "IncidentPriority" ADD VALUE 'P4';

-- AlterTable
ALTER TABLE "incident" RENAME CONSTRAINT "incidents_pkey" TO "incident_pkey";

-- AlterTable
ALTER TABLE "incident_update" RENAME CONSTRAINT "incident_updates_pkey" TO "incident_update_pkey";

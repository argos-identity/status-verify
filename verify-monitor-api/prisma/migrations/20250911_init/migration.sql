-- CreateEnum
CREATE TYPE "UptimeStatus" AS ENUM ('o', 'po', 'mo', 'nd', 'e');

-- CreateEnum
CREATE TYPE "IncidentStatus" AS ENUM ('investigating', 'identified', 'monitoring', 'resolved');

-- CreateEnum
CREATE TYPE "IncidentSeverity" AS ENUM ('low', 'medium', 'high', 'critical');

-- CreateEnum
CREATE TYPE "IncidentPriority" AS ENUM ('P1', 'P2', 'P3');

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('viewer', 'reporter', 'admin');

-- CreateEnum
CREATE TYPE "WatchErrorType" AS ENUM ('timeout', 'connection_error', 'http_error', 'dns_error');

-- CreateEnum
CREATE TYPE "SystemHealthStatus" AS ENUM ('operational', 'degraded', 'outage');

-- CreateTable
CREATE TABLE "services" (
    "id" TEXT NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "description" TEXT,
    "endpoint_url" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "services_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "uptime_records" (
    "id" SERIAL NOT NULL,
    "service_id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "status" "UptimeStatus" NOT NULL,
    "response_time" INTEGER,
    "error_message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "uptime_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "incidents" (
    "id" TEXT NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "status" "IncidentStatus" NOT NULL,
    "severity" "IncidentSeverity" NOT NULL,
    "priority" "IncidentPriority" NOT NULL,
    "reporter" VARCHAR(100),
    "detection_criteria" TEXT,
    "affected_services" TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMP(3),

    CONSTRAINT "incidents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "incident_updates" (
    "id" SERIAL NOT NULL,
    "incident_id" TEXT NOT NULL,
    "status" "IncidentStatus",
    "description" TEXT NOT NULL,
    "user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "incident_updates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "username" VARCHAR(50) NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "password_hash" VARCHAR(255) NOT NULL,
    "role" "UserRole" NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_login_at" TIMESTAMP(3),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "api_response_times" (
    "id" SERIAL NOT NULL,
    "service_id" TEXT NOT NULL,
    "response_time" INTEGER NOT NULL,
    "status_code" INTEGER NOT NULL,
    "endpoint" VARCHAR(255),
    "method" VARCHAR(10) NOT NULL DEFAULT 'GET',
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "api_response_times_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "api_call_logs" (
    "id" SERIAL NOT NULL,
    "service_id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "total_calls" INTEGER NOT NULL DEFAULT 0,
    "success_calls" INTEGER NOT NULL DEFAULT 0,
    "error_calls" INTEGER NOT NULL DEFAULT 0,
    "avg_response_time" INTEGER,
    "max_response_time" INTEGER,
    "min_response_time" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "api_call_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "watch_server_logs" (
    "id" SERIAL NOT NULL,
    "service_id" TEXT NOT NULL,
    "check_time" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status_code" INTEGER,
    "response_time" INTEGER,
    "is_success" BOOLEAN NOT NULL,
    "error_message" TEXT,
    "error_type" "WatchErrorType",

    CONSTRAINT "watch_server_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system_status" (
    "id" SERIAL NOT NULL,
    "overall_status" "SystemHealthStatus" NOT NULL,
    "message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "system_status_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "uptime_records_service_id_date_key" ON "uptime_records"("service_id", "date");

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "api_response_times_service_id_timestamp_idx" ON "api_response_times"("service_id", "timestamp");

-- CreateIndex
CREATE INDEX "api_response_times_timestamp_idx" ON "api_response_times"("timestamp");

-- CreateIndex
CREATE UNIQUE INDEX "api_call_logs_service_id_date_key" ON "api_call_logs"("service_id", "date");

-- CreateIndex
CREATE INDEX "watch_server_logs_service_id_check_time_idx" ON "watch_server_logs"("service_id", "check_time");

-- CreateIndex
CREATE INDEX "watch_server_logs_check_time_idx" ON "watch_server_logs"("check_time");

-- AddForeignKey
ALTER TABLE "uptime_records" ADD CONSTRAINT "uptime_records_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "services"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incident_updates" ADD CONSTRAINT "incident_updates_incident_id_fkey" FOREIGN KEY ("incident_id") REFERENCES "incidents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incident_updates" ADD CONSTRAINT "incident_updates_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_response_times" ADD CONSTRAINT "api_response_times_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "services"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_call_logs" ADD CONSTRAINT "api_call_logs_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "services"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "watch_server_logs" ADD CONSTRAINT "watch_server_logs_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "services"("id") ON DELETE CASCADE ON UPDATE CASCADE;
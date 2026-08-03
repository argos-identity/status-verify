-- Incident-only pivot: verify-main and watch-server decommissioned.

ALTER TABLE "incident" DROP COLUMN "affected_services";

DROP TABLE "watch_server_logs";
DROP TABLE "api_response_times";
DROP TABLE "api_call_logs";
DROP TABLE "uptime_records";
DROP TABLE "system_status";

DROP TYPE "UptimeStatus";
DROP TYPE "WatchErrorType";
DROP TYPE "SystemHealthStatus";

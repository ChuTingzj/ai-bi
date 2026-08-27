-- AlterTable
ALTER TABLE "messages" ADD COLUMN "intent" JSONB;
ALTER TABLE "messages" ADD COLUMN "sql_edited" BOOLEAN NOT NULL DEFAULT false;

import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260929203143 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "mpesa_account_claim" drop constraint if exists "mpesa_account_claim_unique";`);
    this.addSql(`create table if not exists "mpesa_account_claim" ("id" text not null, "account_type" text check ("account_type" in ('till', 'paybill', 'pochi')) not null, "account_number" text not null, "registered_name" text not null, "store_name" text not null, "owner_msisdn" text not null, "session_id" text not null, "verified_at" timestamptz not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "mpesa_account_claim_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_mpesa_account_claim_deleted_at" ON "mpesa_account_claim" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_mpesa_account_claim_unique" ON "mpesa_account_claim" ("account_type", "account_number") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "mpesa_onboarding_session" ("id" text not null, "msisdn" text not null, "channel" text check ("channel" in ('cli', 'whatsapp', 'business_hub')) not null, "status" text check ("status" in ('active', 'locked', 'completed')) not null default 'active', "step" text check ("step" in ('language', 'terms', 'account_type', 'account_number', 'otp', 'store_name', 'category', 'products', 'review', 'completed')) not null default 'language', "language" text check ("language" in ('en', 'sw')) not null default 'en', "answers" jsonb not null default '{}', "account_type" text check ("account_type" in ('till', 'paybill', 'pochi')) null, "account_number" text null, "registered_name" text null, "verified_at" timestamptz null, "otp_hash" text null, "otp_expires_at" timestamptz null, "otp_attempts" integer not null default 0, "lookup_attempts" integer not null default 0, "locked_until" timestamptz null, "merchant_id" text null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "mpesa_onboarding_session_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_mpesa_onboarding_session_deleted_at" ON "mpesa_onboarding_session" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_mpesa_onboarding_session_msisdn" ON "mpesa_onboarding_session" ("msisdn", "status") WHERE deleted_at IS NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "mpesa_account_claim" cascade;`);

    this.addSql(`drop table if exists "mpesa_onboarding_session" cascade;`);
  }

}

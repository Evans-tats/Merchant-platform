import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260929203142 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "mpesa_registry_account" drop constraint if exists "mpesa_registry_account_unique";`);
    this.addSql(`create table if not exists "mpesa_registry_account" ("id" text not null, "account_type" text check ("account_type" in ('till', 'paybill', 'pochi')) not null, "account_number" text not null, "registered_name" text not null, "owner_msisdn" text not null, "kyc_status" text check ("kyc_status" in ('verified', 'pending', 'suspended')) not null default 'verified', "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "mpesa_registry_account_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_mpesa_registry_account_deleted_at" ON "mpesa_registry_account" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_mpesa_registry_account_unique" ON "mpesa_registry_account" ("account_type", "account_number") WHERE deleted_at IS NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "mpesa_registry_account" cascade;`);
  }

}

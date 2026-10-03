import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260905202009 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "merchant_theme" drop constraint if exists "merchant_theme_active_unique";`);
    this.addSql(`alter table if exists "merchant_theme" drop constraint if exists "merchant_theme_version_unique";`);
    this.addSql(`alter table if exists "merchant_payment_config" drop constraint if exists "merchant_payment_config_unique";`);
    this.addSql(`alter table if exists "merchant_member" drop constraint if exists "merchant_member_unique";`);
    this.addSql(`alter table if exists "merchant_domain" drop constraint if exists "merchant_domain_primary_unique";`);
    this.addSql(`alter table if exists "merchant_domain" drop constraint if exists "merchant_domain_hostname_unique";`);
    this.addSql(`alter table if exists "merchant_customer_address" drop constraint if exists "merchant_customer_address_default_shipping_unique";`);
    this.addSql(`alter table if exists "merchant_customer_address" drop constraint if exists "merchant_customer_address_default_billing_unique";`);
    this.addSql(`alter table if exists "merchant_customer_profile" drop constraint if exists "merchant_customer_profile_unique";`);
    this.addSql(`alter table if exists "merchant" drop constraint if exists "merchant_slug_unique";`);
    this.addSql(`create table if not exists "merchant" ("id" text not null, "name" text not null, "slug" text not null, "status" text check ("status" in ('draft', 'active', 'suspended')) not null default 'draft', "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "merchant_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_merchant_deleted_at" ON "merchant" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_merchant_slug_unique" ON "merchant" ("slug") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "merchant_customer_profile" ("id" text not null, "merchant_id" text not null, "customer_id" text not null, "status" text check ("status" in ('active', 'suspended')) not null default 'active', "profile" jsonb not null default '{}', "preferences" jsonb not null default '{}', "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "merchant_customer_profile_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_merchant_customer_profile_merchant_id" ON "merchant_customer_profile" ("merchant_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_merchant_customer_profile_deleted_at" ON "merchant_customer_profile" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_merchant_customer_profile_customer_id" ON "merchant_customer_profile" ("customer_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_merchant_customer_profile_unique" ON "merchant_customer_profile" ("merchant_id", "customer_id") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "merchant_customer_address" ("id" text not null, "merchant_customer_profile_id" text not null, "address_name" text null, "is_default_shipping" boolean not null default false, "is_default_billing" boolean not null default false, "company" text null, "first_name" text null, "last_name" text null, "address_1" text null, "address_2" text null, "city" text null, "country_code" text null, "province" text null, "postal_code" text null, "phone" text null, "metadata" jsonb null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "merchant_customer_address_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_merchant_customer_address_merchant_customer_profile_id" ON "merchant_customer_address" ("merchant_customer_profile_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_merchant_customer_address_deleted_at" ON "merchant_customer_address" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_merchant_customer_address_profile_id" ON "merchant_customer_address" ("merchant_customer_profile_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_merchant_customer_address_default_billing_unique" ON "merchant_customer_address" ("merchant_customer_profile_id") WHERE deleted_at IS NULL AND "is_default_billing" = true;`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_merchant_customer_address_default_shipping_unique" ON "merchant_customer_address" ("merchant_customer_profile_id") WHERE deleted_at IS NULL AND "is_default_shipping" = true;`);

    this.addSql(`create table if not exists "merchant_domain" ("id" text not null, "merchant_id" text not null, "hostname" text not null, "type" text check ("type" in ('platform', 'custom')) not null, "status" text check ("status" in ('pending', 'verified', 'active', 'disabled')) not null default 'pending', "is_primary" boolean not null default false, "verification_token_hash" text null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "merchant_domain_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_merchant_domain_merchant_id" ON "merchant_domain" ("merchant_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_merchant_domain_deleted_at" ON "merchant_domain" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_merchant_domain_hostname_unique" ON "merchant_domain" ("hostname") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_merchant_domain_primary_unique" ON "merchant_domain" ("merchant_id") WHERE deleted_at IS NULL AND "is_primary" = true;`);

    this.addSql(`create table if not exists "merchant_member" ("id" text not null, "merchant_id" text not null, "actor_id" text not null, "role" text check ("role" in ('owner', 'admin', 'staff')) not null, "status" text check ("status" in ('invited', 'active', 'suspended')) not null default 'invited', "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "merchant_member_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_merchant_member_merchant_id" ON "merchant_member" ("merchant_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_merchant_member_deleted_at" ON "merchant_member" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_merchant_member_actor_id" ON "merchant_member" ("actor_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_merchant_member_unique" ON "merchant_member" ("merchant_id", "actor_id") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "merchant_payment_config" ("id" text not null, "merchant_id" text not null, "provider" text check ("provider" in ('mpesa_stk', 'mpesa_paybill')) not null, "mode" text check ("mode" in ('sandbox', 'production')) not null default 'sandbox', "status" text check ("status" in ('disabled', 'active')) not null default 'disabled', "public_configuration" jsonb not null default '{}', "secret_reference" text null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "merchant_payment_config_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_merchant_payment_config_merchant_id" ON "merchant_payment_config" ("merchant_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_merchant_payment_config_deleted_at" ON "merchant_payment_config" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_merchant_payment_config_unique" ON "merchant_payment_config" ("merchant_id", "provider", "mode") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "merchant_theme" ("id" text not null, "merchant_id" text not null, "version" integer not null default 1, "configuration" jsonb not null default '{}', "is_active" boolean not null default false, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "merchant_theme_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_merchant_theme_merchant_id" ON "merchant_theme" ("merchant_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_merchant_theme_deleted_at" ON "merchant_theme" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_merchant_theme_version_unique" ON "merchant_theme" ("merchant_id", "version") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_merchant_theme_active_unique" ON "merchant_theme" ("merchant_id") WHERE deleted_at IS NULL AND "is_active" = true;`);

    this.addSql(`alter table if exists "merchant_customer_profile" add constraint "merchant_customer_profile_merchant_id_foreign" foreign key ("merchant_id") references "merchant" ("id") on update cascade on delete cascade;`);

    this.addSql(`alter table if exists "merchant_customer_address" add constraint "merchant_customer_address_merchant_customer_profile_id_foreign" foreign key ("merchant_customer_profile_id") references "merchant_customer_profile" ("id") on update cascade on delete cascade;`);

    this.addSql(`alter table if exists "merchant_domain" add constraint "merchant_domain_merchant_id_foreign" foreign key ("merchant_id") references "merchant" ("id") on update cascade on delete cascade;`);

    this.addSql(`alter table if exists "merchant_member" add constraint "merchant_member_merchant_id_foreign" foreign key ("merchant_id") references "merchant" ("id") on update cascade on delete cascade;`);

    this.addSql(`alter table if exists "merchant_payment_config" add constraint "merchant_payment_config_merchant_id_foreign" foreign key ("merchant_id") references "merchant" ("id") on update cascade on delete cascade;`);

    this.addSql(`alter table if exists "merchant_theme" add constraint "merchant_theme_merchant_id_foreign" foreign key ("merchant_id") references "merchant" ("id") on update cascade on delete cascade;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table if exists "merchant_customer_profile" drop constraint if exists "merchant_customer_profile_merchant_id_foreign";`);

    this.addSql(`alter table if exists "merchant_domain" drop constraint if exists "merchant_domain_merchant_id_foreign";`);

    this.addSql(`alter table if exists "merchant_member" drop constraint if exists "merchant_member_merchant_id_foreign";`);

    this.addSql(`alter table if exists "merchant_payment_config" drop constraint if exists "merchant_payment_config_merchant_id_foreign";`);

    this.addSql(`alter table if exists "merchant_theme" drop constraint if exists "merchant_theme_merchant_id_foreign";`);

    this.addSql(`alter table if exists "merchant_customer_address" drop constraint if exists "merchant_customer_address_merchant_customer_profile_id_foreign";`);

    this.addSql(`drop table if exists "merchant" cascade;`);

    this.addSql(`drop table if exists "merchant_customer_profile" cascade;`);

    this.addSql(`drop table if exists "merchant_customer_address" cascade;`);

    this.addSql(`drop table if exists "merchant_domain" cascade;`);

    this.addSql(`drop table if exists "merchant_member" cascade;`);

    this.addSql(`drop table if exists "merchant_payment_config" cascade;`);

    this.addSql(`drop table if exists "merchant_theme" cascade;`);
  }

}

import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260907063855 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table if not exists "merchant_activity" ("id" text not null, "merchant_id" text not null, "actor_id" text null, "action" text not null, "resource_type" text not null, "resource_id" text null, "description" text not null, "metadata" jsonb not null default '{}', "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "merchant_activity_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_merchant_activity_merchant_id" ON "merchant_activity" ("merchant_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_merchant_activity_deleted_at" ON "merchant_activity" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_merchant_activity_resource" ON "merchant_activity" ("merchant_id", "resource_type", "resource_id") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "merchant_notification" ("id" text not null, "merchant_id" text not null, "type" text not null, "severity" text check ("severity" in ('info', 'warning', 'critical')) not null default 'info', "title" text not null, "message" text not null, "resource_type" text null, "resource_id" text null, "read_at" timestamptz null, "metadata" jsonb not null default '{}', "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "merchant_notification_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_merchant_notification_merchant_id" ON "merchant_notification" ("merchant_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_merchant_notification_deleted_at" ON "merchant_notification" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_merchant_notification_unread" ON "merchant_notification" ("merchant_id", "read_at") WHERE deleted_at IS NULL;`);

    this.addSql(`alter table if exists "merchant_activity" add constraint "merchant_activity_merchant_id_foreign" foreign key ("merchant_id") references "merchant" ("id") on update cascade on delete cascade;`);

    this.addSql(`alter table if exists "merchant_notification" add constraint "merchant_notification_merchant_id_foreign" foreign key ("merchant_id") references "merchant" ("id") on update cascade on delete cascade;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "merchant_activity" cascade;`);

    this.addSql(`drop table if exists "merchant_notification" cascade;`);
  }

}

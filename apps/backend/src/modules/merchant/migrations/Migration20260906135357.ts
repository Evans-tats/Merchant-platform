import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260906135357 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "merchant_invitation" drop constraint if exists "merchant_invitation_pending_email_unique";`);
    this.addSql(`alter table if exists "merchant_invitation" drop constraint if exists "merchant_invitation_invite_id_unique";`);
    this.addSql(`create table if not exists "merchant_invitation" ("id" text not null, "merchant_id" text not null, "invite_id" text not null, "email" text not null, "role" text check ("role" in ('admin', 'staff')) not null, "status" text check ("status" in ('pending', 'accepted', 'revoked')) not null default 'pending', "invited_by_actor_id" text not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "merchant_invitation_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_merchant_invitation_merchant_id" ON "merchant_invitation" ("merchant_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_merchant_invitation_deleted_at" ON "merchant_invitation" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_merchant_invitation_invite_id_unique" ON "merchant_invitation" ("invite_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_merchant_invitation_pending_email_unique" ON "merchant_invitation" ("merchant_id", "email") WHERE deleted_at IS NULL AND status = 'pending';`);

    this.addSql(`alter table if exists "merchant_invitation" add constraint "merchant_invitation_merchant_id_foreign" foreign key ("merchant_id") references "merchant" ("id") on update cascade on delete cascade;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "merchant_invitation" cascade;`);
  }

}

import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20261003150538 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table if not exists "agent_session" ("id" text not null, "agent_type" text not null, "merchant_id" text not null, "created_by_id" text not null, "title" text null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "agent_session_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_agent_session_deleted_at" ON "agent_session" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_agent_session_owner" ON "agent_session" ("merchant_id", "created_by_id", "agent_type") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "agent_message" ("id" text not null, "session_id" text not null, "role" text check ("role" in ('user', 'assistant')) not null, "content" text not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "agent_message_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_agent_message_session_id" ON "agent_message" ("session_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_agent_message_deleted_at" ON "agent_message" ("deleted_at") WHERE deleted_at IS NULL;`);

    this.addSql(`alter table if exists "agent_message" add constraint "agent_message_session_id_foreign" foreign key ("session_id") references "agent_session" ("id") on update cascade on delete cascade;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table if exists "agent_message" drop constraint if exists "agent_message_session_id_foreign";`);

    this.addSql(`drop table if exists "agent_session" cascade;`);

    this.addSql(`drop table if exists "agent_message" cascade;`);
  }

}

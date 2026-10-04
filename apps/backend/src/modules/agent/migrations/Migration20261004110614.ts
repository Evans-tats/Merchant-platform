import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20261004110614 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table if not exists "agent_proposal" ("id" text not null, "session_id" text not null, "message_id" text null, "action" text not null, "args" jsonb not null, "preview" jsonb not null, "summary" text not null, "status" text check ("status" in ('pending', 'approved', 'dismissed', 'failed')) not null default 'pending', "error" text null, "resolved_by_id" text null, "resolved_at" timestamptz null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "agent_proposal_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_agent_proposal_session_id" ON "agent_proposal" ("session_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_agent_proposal_deleted_at" ON "agent_proposal" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_agent_proposal_message_id" ON "agent_proposal" ("message_id") WHERE deleted_at IS NULL;`);

    this.addSql(`alter table if exists "agent_proposal" add constraint "agent_proposal_session_id_foreign" foreign key ("session_id") references "agent_session" ("id") on update cascade on delete cascade;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "agent_proposal" cascade;`);
  }

}

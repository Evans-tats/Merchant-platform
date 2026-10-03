import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260905202253 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`drop index if exists "IDX_merchant_customer_address_profile_id";`);
  }

  override async down(): Promise<void> {
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_merchant_customer_address_profile_id" ON "merchant_customer_address" ("merchant_customer_profile_id") WHERE deleted_at IS NULL;`);
  }

}

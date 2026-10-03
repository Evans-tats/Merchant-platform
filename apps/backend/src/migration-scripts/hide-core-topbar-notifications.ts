import type { MedusaContainer } from "@medusajs/framework"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"

const topbarZone = "topbar"
// Layout Composer id of the dashboard's built-in notifications bell.
const coreNotificationsEntry = "core:Notifications"

// The core bell opens Medusa's platform feed, which never holds merchant
// alerts; the merchant topbar widget renders its own bell instead. Hiding it in
// the zone's system default keeps it reversible from the dashboard's Editor.
export default async function hideCoreTopbarNotifications({
  container,
}: {
  container: MedusaContainer
}) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const settingsModuleService = container.resolve(Modules.SETTINGS)

  const current =
    await settingsModuleService.getSystemDefaultLayoutConfiguration(topbarZone)
  const widgets = current?.configuration.widgets ?? {}

  await settingsModuleService.setSystemDefaultLayoutConfiguration(topbarZone, {
    widgets: {
      ...widgets,
      [coreNotificationsEntry]: {
        ...widgets[coreNotificationsEntry],
        hidden: true,
      },
    },
  })

  logger.info("Hid the core notifications bell in the default topbar layout")
}

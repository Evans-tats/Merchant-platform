import { MedusaService } from "@medusajs/framework/utils"

import MerchantCustomerAddress from "./models/merchant-customer-address"
import MerchantCustomerProfile from "./models/merchant-customer-profile"
import MerchantActivity from "./models/merchant-activity"
import MerchantDomain from "./models/merchant-domain"
import MerchantInvitation from "./models/merchant-invitation"
import MerchantMember from "./models/merchant-member"
import MerchantNotification from "./models/merchant-notification"
import MerchantPaymentConfig from "./models/merchant-payment-config"
import MerchantTheme from "./models/merchant-theme"
import Merchant from "./models/merchant"

class MerchantModuleService extends MedusaService({
  Merchant,
  MerchantDomain,
  MerchantInvitation,
  MerchantMember,
  MerchantTheme,
  MerchantPaymentConfig,
  MerchantCustomerProfile,
  MerchantCustomerAddress,
  MerchantActivity,
  MerchantNotification,
}) {}

export default MerchantModuleService

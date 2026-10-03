const { MetadataStorage } = require("@medusajs/framework/mikro-orm/core")

process.env.JWT_SECRET ??= "merchant-platform-integration-jwt-secret"
process.env.COOKIE_SECRET ??= "merchant-platform-integration-cookie-secret"

MetadataStorage.clear()

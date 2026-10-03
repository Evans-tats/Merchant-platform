import type {
  MpesaAccountType,
  OnboardingLanguage,
  OnboardingProduct,
  StoreCategory,
} from "./parsing"

export type OnboardingSummary = {
  store_name: string
  category: StoreCategory
  account_type: MpesaAccountType
  account_number: string
  products: OnboardingProduct[]
}

export type PublishedStore = {
  store_url: string
  admin_url: string
  login_email: string
  password: string | null
}

const formatPrice = (price: number) =>
  price.toLocaleString("en-KE", { maximumFractionDigits: 2 })

const languagePrompt = "Choose your language / Chagua lugha:\n1. English\n2. Kiswahili"

const en = {
  welcome: "Karibu! I'll help you set up an online store for your M-PESA business in a few minutes.",
  welcomeBack: "Welcome back! Let's continue where you left off.",
  languagePrompt,
  termsPrompt: "To continue, you agree to the M-PESA Online Store terms and allow us to check your M-PESA business account (Till, Paybill, or Pochi la Biashara) to confirm it belongs to you.\nReply YES to accept or NO to stop.",
  termsDeclined: "No problem. We can't set up a store without your consent. Reply YES whenever you're ready.",
  accountTypePrompt: "Which M-PESA account should customers pay into?\n1. Till (Buy Goods)\n2. Paybill\n3. Pochi la Biashara on this phone number",
  accountTypeLabel: {
    till: "Till",
    paybill: "Paybill",
    pochi: "Pochi la Biashara",
  } as Record<MpesaAccountType, string>,
  accountNumberPrompt: (label: string) => `Enter your ${label} number.`,
  invalidAccountNumber: "That doesn't look right. Till and Paybill numbers have 5 to 7 digits.",
  codeSent: (label: string, maskedPhone: string) =>
    `We sent a 6-digit code to the phone registered to this ${label} (${maskedPhone}). Enter it here to confirm you own the account.\nReply RESEND for a new code.`,
  accountNotFound: (attemptsLeft: number) =>
    `We couldn't verify that account. Check the number and try again (${attemptsLeft} attempts left).`,
  pochiNotFound: "We couldn't find a verified Pochi la Biashara on this phone number. Choose another account type.",
  invalidCodeFormat: "Enter the 6-digit code we sent, or reply RESEND.",
  invalidCode: (attemptsLeft: number) =>
    `That code is not correct. ${attemptsLeft} attempt${attemptsLeft === 1 ? "" : "s"} left.`,
  codeExpired: "That code has expired. Reply RESEND for a new one.",
  alreadyClaimed: "This account is already linked to an online store. Log in to your store admin to manage it, or choose a different account.",
  verified: (registeredName: string, suggestedName: string) =>
    `Verified! This account is registered to ${registeredName}.\nWhat should we call your store?\nReply 1 to use "${suggestedName}", or type a different name.`,
  invalidStoreName: "Store names need 2 to 60 characters.",
  categoryPrompt: "What do you sell?\n1. Groceries\n2. Fashion\n3. Electronics\n4. Beauty\n5. Food and drinks\n6. Other",
  categoryLabel: {
    groceries: "Groceries",
    fashion: "Fashion",
    electronics: "Electronics",
    beauty: "Beauty",
    food: "Food and drinks",
    other: "Other",
  } as Record<StoreCategory, string>,
  productsPrompt: (max: number) =>
    `Now add your first product as: name, price\nExample: Unga 2kg, 250\nYou can add up to ${max} products now and more later.`,
  productAdded: (product: OnboardingProduct) =>
    `Added ${product.title} at KES ${formatPrice(product.price)}. Send another product, UNDO to remove it, or DONE to continue.`,
  productRemoved: (title: string) => `Removed ${title}.`,
  invalidProduct: "Send the product as: name, price (for example: Unga 2kg, 250).",
  needProduct: "Add at least one product before continuing.",
  productLimit: (max: number) => `You've added ${max} products. Reply DONE to continue.`,
  review: (summary: OnboardingSummary) => [
    "Here's your store:",
    `Name: ${summary.store_name}`,
    `Category: ${en.categoryLabel[summary.category]}`,
    `Payments: ${en.accountTypeLabel[summary.account_type]} ${summary.account_number}`,
    "Products:",
    ...summary.products.map(({ title, price }) => `- ${title}: KES ${formatPrice(price)}`),
    "",
    "Reply PUBLISH to create your store, or RESTART to start over.",
  ].join("\n"),
  reviewPrompt: "Reply PUBLISH to create your store, or RESTART to start over.",
  publishing: "Creating your store...",
  published: (store: PublishedStore) => [
    "Your store is live!",
    `Store link: ${store.store_url}`,
    "Share it with your customers on WhatsApp, SMS, or social media.",
    "",
    `Manage orders and products: ${store.admin_url}`,
    `Login: ${store.login_email}`,
    store.password
      ? `Password: ${store.password} (change it after you log in)`
      : "Use the password you already have for this login.",
  ].join("\n"),
  publishFailed: (reason: string) =>
    `We couldn't create your store: ${reason}\nReply PUBLISH to try again.`,
  completed: "Your store is already set up. Reply RESTART to set up a store for another M-PESA account.",
  locked: "For your security, setup is paused for 30 minutes after too many attempts. Please try again later.",
  help: "Reply RESTART to start over at any time. Your progress is saved, so you can come back later and continue where you left off.",
}

export type OnboardingMessages = typeof en

const sw: OnboardingMessages = {
  welcome: "Karibu! Nitakusaidia kufungua duka la mtandaoni kwa biashara yako ya M-PESA kwa dakika chache.",
  welcomeBack: "Karibu tena! Tuendelee pale ulipoachia.",
  languagePrompt,
  termsPrompt: "Ili kuendelea, unakubali masharti ya M-PESA Online Store na unaturuhusu kukagua akaunti yako ya biashara ya M-PESA (Till, Paybill au Pochi la Biashara) kuthibitisha kuwa ni yako.\nJibu NDIO kukubali au HAPANA kusimama.",
  termsDeclined: "Sawa. Hatuwezi kufungua duka bila idhini yako. Jibu NDIO ukiwa tayari.",
  accountTypePrompt: "Wateja walipe kupitia akaunti gani ya M-PESA?\n1. Till (Buy Goods)\n2. Paybill\n3. Pochi la Biashara kwenye nambari hii ya simu",
  accountTypeLabel: en.accountTypeLabel,
  accountNumberPrompt: (label) => `Weka nambari yako ya ${label}.`,
  invalidAccountNumber: "Nambari hiyo si sahihi. Nambari za Till na Paybill zina tarakimu 5 hadi 7.",
  codeSent: (label, maskedPhone) =>
    `Tumetuma nambari ya siri ya tarakimu 6 kwa simu iliyosajiliwa kwa ${label} hii (${maskedPhone}). Iweke hapa kuthibitisha kuwa akaunti ni yako.\nJibu RESEND kupata nambari mpya.`,
  accountNotFound: (attemptsLeft) =>
    `Hatukuweza kuthibitisha akaunti hiyo. Kagua nambari na ujaribu tena (majaribio ${attemptsLeft} yamebaki).`,
  pochiNotFound: "Hatukupata Pochi la Biashara lililothibitishwa kwenye nambari hii ya simu. Chagua aina nyingine ya akaunti.",
  invalidCodeFormat: "Weka nambari ya siri ya tarakimu 6 tuliyotuma, au jibu RESEND.",
  invalidCode: (attemptsLeft) =>
    `Nambari hiyo si sahihi. Majaribio ${attemptsLeft} yamebaki.`,
  codeExpired: "Nambari hiyo imeisha muda. Jibu RESEND kupata mpya.",
  alreadyClaimed: "Akaunti hii tayari imeunganishwa na duka la mtandaoni. Ingia kwenye ukurasa wa usimamizi wa duka lako, au chagua akaunti nyingine.",
  verified: (registeredName, suggestedName) =>
    `Imethibitishwa! Akaunti hii imesajiliwa kwa ${registeredName}.\nDuka lako liitwe nini?\nJibu 1 kutumia "${suggestedName}", au andika jina lingine.`,
  invalidStoreName: "Jina la duka linahitaji herufi 2 hadi 60.",
  categoryPrompt: "Unauza nini?\n1. Vyakula na mboga\n2. Mavazi\n3. Vifaa vya elektroniki\n4. Urembo\n5. Chakula na vinywaji\n6. Nyingine",
  categoryLabel: {
    groceries: "Vyakula na mboga",
    fashion: "Mavazi",
    electronics: "Vifaa vya elektroniki",
    beauty: "Urembo",
    food: "Chakula na vinywaji",
    other: "Nyingine",
  },
  productsPrompt: (max) =>
    `Sasa ongeza bidhaa yako ya kwanza hivi: jina, bei\nMfano: Unga 2kg, 250\nUnaweza kuongeza hadi bidhaa ${max} sasa na zaidi baadaye.`,
  productAdded: (product) =>
    `Umeongeza ${product.title} kwa KES ${formatPrice(product.price)}. Tuma bidhaa nyingine, UNDO kuiondoa, au DONE kuendelea.`,
  productRemoved: (title) => `Umeondoa ${title}.`,
  invalidProduct: "Tuma bidhaa hivi: jina, bei (mfano: Unga 2kg, 250).",
  needProduct: "Ongeza angalau bidhaa moja kabla ya kuendelea.",
  productLimit: (max) => `Umeongeza bidhaa ${max}. Jibu DONE kuendelea.`,
  review: (summary) => [
    "Hili ndilo duka lako:",
    `Jina: ${summary.store_name}`,
    `Aina: ${sw.categoryLabel[summary.category]}`,
    `Malipo: ${sw.accountTypeLabel[summary.account_type]} ${summary.account_number}`,
    "Bidhaa:",
    ...summary.products.map(({ title, price }) => `- ${title}: KES ${formatPrice(price)}`),
    "",
    "Jibu PUBLISH kufungua duka lako, au RESTART kuanza upya.",
  ].join("\n"),
  reviewPrompt: "Jibu PUBLISH kufungua duka lako, au RESTART kuanza upya.",
  publishing: "Tunafungua duka lako...",
  published: (store) => [
    "Duka lako liko hewani!",
    `Kiungo cha duka: ${store.store_url}`,
    "Kishiriki na wateja wako kwenye WhatsApp, SMS au mitandao ya kijamii.",
    "",
    `Simamia oda na bidhaa: ${store.admin_url}`,
    `Barua pepe ya kuingia: ${store.login_email}`,
    store.password
      ? `Nenosiri: ${store.password} (libadilishe baada ya kuingia)`
      : "Tumia nenosiri ulilonalo tayari kwa akaunti hii.",
  ].join("\n"),
  publishFailed: (reason) =>
    `Hatukuweza kufungua duka lako: ${reason}\nJibu PUBLISH kujaribu tena.`,
  completed: "Duka lako tayari limefunguliwa. Jibu RESTART kufungua duka la akaunti nyingine ya M-PESA.",
  locked: "Kwa usalama wako, usajili umesimamishwa kwa dakika 30 baada ya majaribio mengi. Tafadhali jaribu tena baadaye.",
  help: "Jibu RESTART kuanza upya wakati wowote. Maendeleo yako yamehifadhiwa, kwa hivyo unaweza kurudi baadaye na kuendelea ulipoachia.",
}

export function messagesFor(language: OnboardingLanguage): OnboardingMessages {
  return language === "sw" ? sw : en
}

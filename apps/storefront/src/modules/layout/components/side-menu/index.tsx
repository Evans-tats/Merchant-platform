"use client"

import { Popover, PopoverPanel, Transition } from "@headlessui/react"
import useToggleState from "@lib/hooks/use-toggle-state"
import { PLATFORM_NAME } from "@lib/constants"
import { ArrowRightMini, BarsThree, XMark } from "@medusajs/icons"
import { HttpTypes } from "@medusajs/types"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import { Text, clx } from "@modules/common/components/ui"
import { Fragment } from "react"
import CountrySelect from "../country-select"
import LanguageSelect from "../language-select"
import { Locale } from "@lib/data/locales"

const SideMenuItems = {
  Home: "/",
  Shop: "/store",
  Account: "/account",
  Cart: "/cart",
}

type SideMenuProps = {
  regions: HttpTypes.StoreRegion[] | null
  locales: Locale[] | null
  currentLocale: string | null
  storeName: string
  pages?: { href: string; label: string }[]
}

const SideMenu = ({
  regions,
  locales,
  currentLocale,
  storeName,
  pages = [],
}: SideMenuProps) => {
  const countryToggleState = useToggleState()
  const languageToggleState = useToggleState()
  const links = [
    ...Object.entries(SideMenuItems).map(([label, href]) => ({ label, href })),
    ...pages,
  ]

  return (
    <div className="h-full">
      <div className="flex items-center h-full">
        <Popover className="h-full flex">
          {({ open, close }) => (
            <>
              <div className="relative flex h-full items-center">
                <Popover.Button
                  data-testid="nav-menu-button"
                  aria-label="Open menu"
                  className="relative flex h-10 w-10 items-center justify-center rounded-full text-ink transition-colors hover:bg-brand-50 hover:text-brand-800"
                >
                  <BarsThree />
                </Popover.Button>
              </div>

              {open && (
                <div
                  className="fixed inset-0 z-[50] bg-ink/40 pointer-events-auto"
                  onClick={close}
                  data-testid="side-menu-backdrop"
                />
              )}

              <Transition
                show={open}
                as={Fragment}
                enter="transition ease-out duration-200"
                enterFrom="opacity-0 -translate-x-4"
                enterTo="opacity-100 translate-x-0"
                leave="transition ease-in duration-150"
                leaveFrom="opacity-100 translate-x-0"
                leaveTo="opacity-0 -translate-x-4"
              >
                <PopoverPanel className="fixed inset-y-0 left-0 z-[51] flex w-[85vw] max-w-sm flex-col text-sm text-ink">
                  <div
                    data-testid="nav-menu-popup"
                    className="flex h-full flex-col justify-between bg-white shadow-2xl"
                  >
                    <div>
                      <div className="flex items-center justify-between border-b border-ink/10 bg-brand-900 px-5 py-4 text-white">
                        <span className="truncate text-lg font-bold">
                          {storeName}
                        </span>
                        <button
                          data-testid="close-menu-button"
                          aria-label="Close menu"
                          onClick={close}
                          className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-white/10"
                        >
                          <XMark />
                        </button>
                      </div>
                      <ul className="flex flex-col p-3">
                        {links.map(({ label, href }) => {
                          return (
                            <li key={href}>
                              <LocalizedClientLink
                                href={href}
                                className="flex items-center justify-between rounded-xl px-3 py-3.5 text-lg font-semibold hover:bg-brand-50 hover:text-brand-800"
                                onClick={close}
                                data-testid={`${label.toLowerCase()}-link`}
                              >
                                {label}
                                <ArrowRightMini className="text-ink-subtle" />
                              </LocalizedClientLink>
                            </li>
                          )
                        })}
                      </ul>
                    </div>
                    <div className="flex flex-col gap-y-4 border-t border-ink/10 p-5">
                      {!!locales?.length && (
                        <div
                          className="flex justify-between"
                          onMouseEnter={languageToggleState.open}
                          onMouseLeave={languageToggleState.close}
                        >
                          <LanguageSelect
                            toggleState={languageToggleState}
                            locales={locales}
                            currentLocale={currentLocale}
                          />
                          <ArrowRightMini
                            className={clx(
                              "transition-transform duration-150",
                              languageToggleState.state ? "-rotate-90" : ""
                            )}
                          />
                        </div>
                      )}
                      <div
                        className="flex justify-between"
                        onMouseEnter={countryToggleState.open}
                        onMouseLeave={countryToggleState.close}
                      >
                        {regions && (
                          <CountrySelect
                            toggleState={countryToggleState}
                            regions={regions}
                          />
                        )}
                        <ArrowRightMini
                          className={clx(
                            "transition-transform duration-150",
                            countryToggleState.state ? "-rotate-90" : ""
                          )}
                        />
                      </div>
                      <Text className="txt-compact-small text-ink-muted">
                        © {new Date().getFullYear()} {storeName}. Powered by{" "}
                        <span className="whitespace-nowrap">{PLATFORM_NAME}</span>.
                      </Text>
                    </div>
                  </div>
                </PopoverPanel>
              </Transition>
            </>
          )}
        </Popover>
      </div>
    </div>
  )
}

export default SideMenu

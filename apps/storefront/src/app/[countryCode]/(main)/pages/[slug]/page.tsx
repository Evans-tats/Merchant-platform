import { listMerchantPages } from "@lib/data/merchant"
import { Heading } from "@modules/common/components/ui"
import { notFound } from "next/navigation"

export default async function MerchantPage(props: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await props.params
  const pages = await listMerchantPages()
  const page = pages.find((candidate) => candidate.slug === slug)

  if (!page) {
    notFound()
  }

  return (
    <div className="content-container py-16 small:py-24">
      <article className="mx-auto max-w-3xl">
        <Heading level="h1" className="mb-8 text-3xl">
          {page.title}
        </Heading>
        <div className="whitespace-pre-wrap text-ui-fg-subtle">
          {page.content}
        </div>
      </article>
    </div>
  )
}

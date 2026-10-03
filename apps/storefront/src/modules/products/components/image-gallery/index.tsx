import { HttpTypes } from "@medusajs/types"
import { clx } from "@modules/common/components/ui"
import PlaceholderImage from "@modules/common/icons/placeholder-image"
import Image from "next/image"

type ImageGalleryProps = {
  images: HttpTypes.StoreProductImage[]
}

/**
 * Swipeable row on phones (the next image peeks in to signal there is more),
 * stacked column on larger screens.
 */
const ImageGallery = ({ images }: ImageGalleryProps) => {
  const hasMany = images.length > 1

  if (!images.length) {
    return (
      <div className="flex aspect-square w-full items-center justify-center rounded-3xl bg-sand">
        <PlaceholderImage size={32} />
      </div>
    )
  }

  return (
    <div className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 no-scrollbar xsmall:-mx-6 xsmall:px-6 small:mx-0 small:flex-col small:gap-4 small:overflow-visible small:px-0">
      {images.map((image, index) => {
        return (
          <div
            key={image.id}
            className={clx(
              "relative aspect-square shrink-0 snap-center overflow-hidden rounded-3xl bg-sand small:w-full",
              hasMany ? "w-[88%]" : "w-full"
            )}
            id={image.id}
          >
            {!!image.url && (
              <Image
                src={image.url}
                priority={index <= 1}
                className="absolute inset-0"
                alt={`Product image ${index + 1} of ${images.length}`}
                fill
                sizes="(max-width: 1024px) 90vw, 640px"
                style={{
                  objectFit: "cover",
                }}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}

export default ImageGallery

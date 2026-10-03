import repeat from "@lib/util/repeat"
import SkeletonProductPreview from "@modules/skeletons/components/skeleton-product-preview"

const SkeletonRelatedProducts = () => {
  return (
    <div>
      <div className="mb-6 h-9 w-64 animate-pulse rounded-lg bg-sand" />
      <ul className="grid grid-cols-2 small:grid-cols-3 medium:grid-cols-4 gap-3 small:gap-5 flex-1">
        {repeat(3).map((index) => (
          <li key={index}>
            <SkeletonProductPreview />
          </li>
        ))}
      </ul>
    </div>
  )
}

export default SkeletonRelatedProducts

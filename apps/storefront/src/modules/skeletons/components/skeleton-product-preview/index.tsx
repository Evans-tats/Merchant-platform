const SkeletonProductPreview = () => {
  return (
    <div className="animate-pulse rounded-2xl border border-ink/10 bg-white p-2 small:p-2.5">
      <div className="aspect-square w-full rounded-xl bg-sand" />
      <div className="flex flex-col gap-2 px-1 py-3">
        <div className="h-4 w-3/4 rounded bg-sand" />
        <div className="h-5 w-1/3 rounded bg-sand" />
      </div>
      <div className="h-11 w-full rounded-full bg-sand" />
    </div>
  )
}

export default SkeletonProductPreview

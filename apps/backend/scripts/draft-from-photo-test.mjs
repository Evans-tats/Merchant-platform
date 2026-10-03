// Drafts a product listing from each photo in a folder, using the same
// service as the admin "Draft details" button, so prompt changes can be
// checked on many photos at once.
// Usage: npm run draft:photo-test -- [folder] [--model=<id>] [--categories="A,B"]
import { readdir, readFile, mkdir, writeFile, stat } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"

import { draftProductPhoto } from "../src/services/product-photo-draft/draft-product-photo.ts"

const backendDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))

const defaultCategories = [
  "Fashion",
  "Shoes",
  "Bags & Accessories",
  "Beauty & Personal Care",
  "Home & Living",
  "Electronics",
  "Food & Drinks",
  "Baby & Kids",
]

const mimeTypes = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".avif": "image/avif",
}

const parseArgs = (argv) => {
  const flags = new Map()
  const positional = []
  for (const arg of argv) {
    const match = arg.match(/^--([^=]+)=(.*)$/)
    if (match) {
      flags.set(match[1], match[2])
    } else {
      positional.push(arg)
    }
  }

  return {
    folder: path.resolve(backendDir, positional[0] ?? "test-photos"),
    models: flags.has("model") ? [flags.get("model")] : undefined,
    categories: flags.has("categories")
      ? flags.get("categories").split(",").map((name) => name.trim()).filter(Boolean)
      : defaultCategories,
  }
}

const listPhotos = async (folder) => {
  const photos = []
  for (const entry of (await readdir(folder)).sort()) {
    const filePath = path.join(folder, entry)
    const info = await stat(filePath)
    // Skips folders, other files, and placeholder files that aren't photos.
    if (info.isFile() && mimeTypes[path.extname(entry).toLowerCase()] && info.size >= 1024) {
      photos.push(filePath)
    }
  }

  return photos
}

const main = async () => {
  const { folder, models, categories } = parseArgs(process.argv.slice(2))
  process.loadEnvFile(path.join(backendDir, ".env"))

  const photos = await listPhotos(folder).catch(() => [])
  if (!photos.length) {
    throw new Error(`No photos found in ${folder}`)
  }

  const resultsDir = path.join(folder, "results")
  await mkdir(resultsDir, { recursive: true })
  process.stdout.write(`Photos: ${photos.length}\n`)

  const totals = { photos: 0, seconds: 0, input: 0, output: 0, thinking: 0 }
  for (const photoPath of photos) {
    const name = path.basename(photoPath)
    const startedAt = Date.now()
    process.stdout.write(`\n--- ${name}\n`)

    try {
      const image = await readFile(photoPath)
      const { draft, model, usage } = await draftProductPhoto({
        images: [{
          mimeType: mimeTypes[path.extname(name).toLowerCase()],
          base64: image.toString("base64"),
        }],
        categories,
        models,
      })
      const seconds = (Date.now() - startedAt) / 1000

      await writeFile(
        path.join(resultsDir, `${path.parse(name).name}.${model}.json`),
        JSON.stringify({ photo: name, model, seconds, usage, draft }, null, 2)
      )
      totals.photos += 1
      totals.seconds += seconds
      totals.input += usage.input
      totals.output += usage.output
      totals.thinking += usage.thinking

      process.stdout.write(
        `${model} | ${seconds.toFixed(1)}s | tokens in ${usage.input}, out ${usage.output}, thinking ${usage.thinking}\n` +
          `${JSON.stringify(draft, null, 2)}\n`
      )
    } catch (error) {
      process.stdout.write(`Failed: ${error instanceof Error ? error.message : String(error)}\n`)
    }
  }

  if (totals.photos) {
    const average = (value) => Math.round(value / totals.photos)
    process.stdout.write(
      `\n${totals.photos}/${photos.length} drafted | avg ${(totals.seconds / totals.photos).toFixed(1)}s, ` +
        `tokens in ${average(totals.input)}, out ${average(totals.output)}, thinking ${average(totals.thinking)}\n` +
        `Results saved in ${path.relative(backendDir, resultsDir)}\n`
    )
  }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
  process.exitCode = 1
})

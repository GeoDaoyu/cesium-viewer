/**
 * 将 Cesium 静态资源（Workers, Assets, Widgets, ThirdParty）
 * 复制到 public/ 目录，使得 dev server 可以直接托管这些文件。
 *
 * 生产构建时由 umi config 中的 copy 配置处理。
 */
import { cp, mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const cesiumBuild = join(root, "node_modules", "cesium", "Build", "Cesium");
const publicCesium = join(root, "public", "cesium");

const dirs = ["Workers", "Assets", "Widgets", "ThirdParty"];

async function main() {
  await mkdir(publicCesium, { recursive: true });
  for (const dir of dirs) {
    const src = join(cesiumBuild, dir);
    const dest = join(publicCesium, dir);
    console.log(`Copying ${dir} → public/cesium/${dir} ...`);
    await cp(src, dest, { recursive: true, force: true });
  }
  console.log("Cesium assets copied to public/cesium/");
}

main().catch((err) => {
  console.error("Failed to copy Cesium assets:", err.message);
  // Don't fail the install — assets are optional for basic viewing
});

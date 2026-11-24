import * as Cesium from "cesium";
import { TERRAIN } from "@/utils/appConfig";

/**
 * 三维地形
 *
 * 使用 Cesium 标准的 `CesiumTerrainProvider`，服务端需要是 quantized-mesh
 * （或 heightmap）格式，根目录下有 `layer.json`。配置见
 * `public/config/app.js` 的 `terrain`：
 *
 *   { url: "https://example.com/terrain/", requestVertexNormals: true }
 *
 * `url` 留空时返回 null，调用方保持光滑椭球。
 *
 * 注意：`viewer.terrainProvider` 是单例，地球只有一层地形；多个地形服务
 * 需要在服务端合成，或自行按范围切换 provider。
 *
 * @param {object} [config] - 地形配置，默认取运行时配置
 * @returns {Promise<Cesium.TerrainProvider|null>}
 */
export async function createTerrainProvider(config = TERRAIN) {
  if (!config?.url) return null;

  return Cesium.CesiumTerrainProvider.fromUrl(config.url, {
    requestVertexNormals: config.requestVertexNormals ?? false,
    requestWaterMask: config.requestWaterMask ?? false,
  });
}

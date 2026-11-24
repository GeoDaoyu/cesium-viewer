import * as Cesium from "cesium";
import { createWMTSLayer } from "./wmts";

/**
 * 底图加载与切换
 *
 * 底图支持两种配置（`public/config/app.js` 的 `basemap` / `basemapServices`）：
 *
 *   { type: "xyz",  url: "https://.../{z}/{x}/{y}.png", maximumLevel, credit }
 *   { type: "wmts", url, layer, style, tileMatrixSetID, ... }   // 见 wmts.js
 *
 * `type` 缺省按 "xyz" 处理。没有 `url` 时返回 false：
 * Viewer 的 `baseLayer` 传 false 表示不建底图，避免 Cesium 回退到默认 Ion 影像。
 */

/**
 * 创建 XYZ 瓦片影像图层
 * @param {object} config
 * @returns {Cesium.ImageryLayer}
 */
function createXyzLayer(config) {
  const provider = new Cesium.UrlTemplateImageryProvider({
    url: config.url,
    maximumLevel: config.maximumLevel,
    minimumLevel: config.minimumLevel,
    credit: config.credit,
    subdomains: config.subdomains,
    rectangle: Array.isArray(config.rectangle)
      ? Cesium.Rectangle.fromDegrees(...config.rectangle)
      : config.rectangle,
  });

  return new Cesium.ImageryLayer(provider);
}

/**
 * 按配置创建底图图层（可直接作为 Viewer 的 baseLayer）
 *
 * @param {object} [config] - basemap / basemapServices 的一项
 * @returns {Cesium.ImageryLayer|false} 未配置 url 时返回 false
 */
export function createBasemapLayer(config = {}) {
  if (!config?.url) return false;

  if (config.type === "wmts") {
    // 底图必须不透明，否则会与下面的图层互相透出
    return createWMTSLayer({ ...config, alpha: 1 });
  }

  return createXyzLayer(config);
}

/**
 * 切换底图：替换 `imageryLayers` 第 0 层
 *
 * 先加新层再摘旧层，切换过程中不会出现「无底图」的一帧；其它影像图层
 * （专题 WMTS 等）的相对顺序不受影响。
 *
 * @param {Cesium.Viewer} viewer - Cesium Viewer 实例
 * @param {object} config - 新底图配置
 * @returns {Cesium.ImageryLayer|null} 新底图图层；配置无效 / viewer 不可用时 null
 */
export function setBasemap(viewer, config) {
  if (!viewer || viewer.isDestroyed()) return null;

  const next = createBasemapLayer(config);
  if (!next) return null;

  const layers = viewer.imageryLayers;
  const previous = layers.length > 0 ? layers.get(0) : null;

  layers.add(next, 0);
  if (previous) layers.remove(previous, true);

  return next;
}

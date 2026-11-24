/**
 * 图层加载工具集
 *
 * 统一导出各类图层的加载 / 移除接口：
 * - 底图（XYZ / WMTS）
 * - 专题图层（按 type 分发：WFS / 查询服务 / 静态 GeoJSON / 标注点 / WMTS / 3D Tiles）
 * - WMS / WMTS / WFS
 * - 内存 GeoJSON
 * - 3D Tiles
 */

export { createBasemapLayer, setBasemap } from "./basemap";

export {
  addThemeLayer,
  removeThemeLayer,
  getThemeLayerType,
  canLoadThemeOption,
} from "./themeLayer";

export { addWMSLayer, removeWMSLayer } from "./wms";

export {
  addWMTSLayer,
  removeWMTSLayer,
  createWMTSProvider,
  createWMTSLayer,
  resolveTilingScheme,
} from "./wmts";

export { addWFSLayer, removeWFSLayer } from "./wfs";

export { addQueryLayer, removeQueryLayer } from "./queryLayer";

export { addGeoJsonThemeLayer, removeGeoJsonThemeLayer } from "./geojsonTheme";

export { addMarkerLayer, removeMarkerLayer } from "./markers";

export { addNameLabels } from "./labels";

export {
  addGeoJsonLayer,
  removeGeoJsonLayer,
  applyDataSourceStyle,
} from "./geojson";

export {
  add3DTilesLayer,
  remove3DTilesLayer,
  set3DTilesStyle,
} from "./threeDTiles";

// ---- 图层查询 ----

/**
 * 通过名称获取图层实例
 *
 * 需要在 addWFSLayer 时传入 name 参数。
 * 内部通过 viewer.dataSources.getByName() 查找。
 *
 * @param {Cesium.Viewer} viewer - Cesium Viewer 实例
 * @param {string} name - 图层名称（创建时传入的 name）
 * @returns {Cesium.GeoJsonDataSource|undefined}
 *
 * @example
 * const ds = getLayerByName(viewer, 'demo-layer');
 * if (ds) highlightFeature(ds, featureId);
 */
export function getLayerByName(viewer, name) {
  return viewer.dataSources.getByName(name);
}

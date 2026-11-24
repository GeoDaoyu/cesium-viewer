import * as Cesium from "cesium";
import { THEME_QUERY_ROOT } from "@/utils/appConfig";
import { queryThemeLayerFeatures } from "@/services/themeQuery";
import { toBoundaryLineCollection } from "@/utils/geojsonBoundary";
import { addGeoJsonLayer, removeGeoJsonLayer } from "./geojson";
import { addNameLabels } from "./labels";
import {
  FillImageryProvider,
  getPolygonsRectangle,
  toFillPolygons,
} from "./fillImagery";

/**
 * 查询服务 → 矢量图层（`type: "query"`）
 *
 * 从地图服务的要素查询接口按整层取 WKT（`/query?withGeometry=true`），前端解析成
 * GeoJSON 后既要面、也要边界和名称。Cesium 的矢量面永远压在所有影像之上，
 * 没法垫在其它切片图层下面，所以这里拆成两层：
 *
 * 1. **填充 = 影像层**：把面几何客户端栅格化成纯色瓦片（`fillImagery.js`），
 *    插到 `imageryLayers` 的底图之上、业务切片之下，底色不会压住其它图层；
 * 2. **边界 + 名称 = 矢量数据源**：贴地线单独画（贴地面图元不支持描边），
 *    名称用实体 label（`labels.js`），永远压在影像之上。
 *
 * 适合要素不多的图层（整层一次取回）。要素几十万条的大图层不要用这个入口，
 * 只能按 `spatialFilter` 单点查，或走 `/count` 只取数量。
 *
 * 配置见 `public/config/app.js` 中 `type: "query"` 的条目。
 */

/** 整层查询一次取多少要素（默认 500，留足余量） */
const DEFAULT_LIMIT = 500;

/** 默认样式：半透明黄填充 + 黄色边界（2px）
 *
 * 透明度只是兜底，配置条目里可以覆盖。
 */
const DEFAULT_FILL_COLOR = "#ffff00";
const DEFAULT_FILL_OPACITY = 0.39;
const DEFAULT_STROKE_COLOR = "#ffff00";
const DEFAULT_STROKE_WIDTH = 1; // applyDataSourceStyle 的线宽 = 该值 + 1 = 2px

/**
 * 查询结果 → GeoJSON FeatureCollection
 *
 * 每个要素保留属性（弹窗 / 标注用），几何来自 `shape` 字段解析出的 GeoJSON。
 * `withBoundary` 为真时，额外把面几何的每个环拆成一条独立 LineString 要素
 * （属性为空），用于贴地描边。
 *
 * @param {Array<{properties: object, geometry: object|null}>} features
 * @param {object} [options]
 * @param {boolean} [options.withBoundary=false] - 是否附带边界线要素
 * @returns {{type: "FeatureCollection", features: object[]}}
 */
function buildFeatureCollection(features = [], { withBoundary = false } = {}) {
  const list = [];

  for (const feature of features) {
    if (!feature?.geometry) continue;

    list.push({
      type: "Feature",
      properties: feature.properties || {},
      geometry: feature.geometry,
    });

    if (!withBoundary) continue;

    const boundary = toBoundaryLineCollection(feature.geometry);
    for (const line of boundary.features) {
      // 边界线不带属性：它只负责描边，不参与标注 / 属性弹窗
      list.push(line);
    }
  }

  return { type: "FeatureCollection", features: list };
}

/**
 * 把面几何栅格化成填充影像，插到专题图 WMTS 下面
 *
 * 与数据来源无关：查询服务取回的 WKT、静态 GeoJSON 文件都先转成 GeoJSON 几何，
 * 再交给这里。`queryLayer.js`（type: "query"）与 `geojsonTheme.js`（type: "geojson"）
 * 共用，保证两种来源的区域面填充叠放位置一致。
 *
 * @param {Cesium.Viewer} viewer
 * @param {Array<object>} geometries - GeoJSON 几何（Polygon / MultiPolygon）
 * @param {object} option - themeOptions 条目
 * @returns {Cesium.ImageryLayer|null} 失败时 null（调用方保留矢量面兜底）
 */
export function addFillImagery(viewer, geometries = [], option = {}) {
  const polygons = toFillPolygons(geometries);
  if (polygons.length === 0) return null;

  const rectangle = getPolygonsRectangle(polygons);
  if (!rectangle) return null;

  const baseColor = Cesium.Color.fromCssColorString(
    option.fillColor || DEFAULT_FILL_COLOR,
  );
  if (!baseColor) return null;

  try {
    const provider = new FillImageryProvider({
      polygons,
      rectangle,
      color: baseColor.withAlpha(option.fillOpacity ?? DEFAULT_FILL_OPACITY),
      minimumLevel: option.fillMinimumLevel,
      maximumLevel: option.fillMaximumLevel,
    });

    // 叠放：底图影像（0）/ 叠加影像 叠加层（1）之上、专题图 WMTS 之下。
    // 固定插到索引 2 —— 未配置时没有叠加层时 length 只有 1，Cesium 会追加到末尾；
    // 后加载的专题图仍在它上面，重新勾选区域面也回到同一位置。
    const layers = viewer.imageryLayers;
    const index = Math.min(2, layers.length);
    return layers.addImageryProvider(provider, index);
  } catch (error) {
    console.warn("[queryLayer] 填充影像创建失败，回退为矢量面:", error);
    return null;
  }
}

/**
 * 隐藏数据源里的面要素（只保留它们的属性 / 锚点给标注用）
 * @param {Cesium.GeoJsonDataSource} dataSource
 */
function hidePolygons(dataSource) {
  for (const entity of dataSource.entities.values) {
    if (entity.polygon) entity.polygon.show = false;
  }
}

/**
 * 加载「查询服务取 WKT」的矢量专题图层
 *
 * @param {Cesium.Viewer} viewer - Cesium Viewer 实例
 * @param {object} option - themeOptions 里 type 为 "query" 的一项
 * @param {string} option.serverName - 服务名称（如 demo_layer）
 * @param {string} [option.queryLayerName] - 查询图层名，默认与服务名相同
 * @param {string} [option.filter] - 可选的属性过滤（SQL 片段）
 * @param {number} [option.limit=500] - 一次取多少要素
 * @param {string} [option.nameField="name"] - 名称字段（标注 + 属性，忽略大小写）
 * @param {boolean} [option.showLabel=true] - 没有 center 字段时是否按几何质心标注
 * @param {string[]} [option.labelExclude] - 标注排除词：名称包含其中任意一个就不标注
 *   （如 ["飞地"] 不展示「示例城市飞地」，面照常渲染）
 * @param {string} [option.fillColor] - 填充色（影像层）
 * @param {number} [option.fillOpacity] - 填充透明度
 * @param {string} [option.strokeColor] - 边界色
 * @param {number} [option.strokeWidth] - 边界宽度（线宽 = strokeWidth + 1）
 * @param {boolean} [option.pickable=false] - 是否参与点击 / 悬停拾取
 * @param {number} [option.fillMinimumLevel] - 填充影像最低级别（默认 6）
 * @param {number} [option.fillMaximumLevel] - 填充影像最高级别（默认 18）
 * @returns {Promise<{dataSource: Cesium.GeoJsonDataSource, imageryLayer: Cesium.ImageryLayer|null}|null>}
 *   viewer 不可用、未配置查询服务、服务没有返回几何时返回 null
 */
export async function addQueryLayer(viewer, option = {}) {
  if (!viewer || viewer.isDestroyed()) return null;

  // 未配置时没有查询服务（themeQueryRoot 为空串）：静默跳过，不发请求
  if (!THEME_QUERY_ROOT) return null;

  const {
    serverName,
    queryLayerName,
    filter,
    limit = DEFAULT_LIMIT,
    nameField = "name",
    showLabel = true,
  } = option;
  if (!serverName) return null;

  const features = await queryThemeLayerFeatures({
    serverName,
    layerName: queryLayerName || serverName,
    filter,
    limit,
  });

  // 异步加载期间 viewer 可能已被销毁（路由切换 / 重建）：直接丢弃
  if (viewer.isDestroyed()) return null;

  const data = buildFeatureCollection(features, { withBoundary: true });
  if (data.features.length === 0) {
    console.warn(`[queryLayer] ${serverName} 没有返回带几何的要素`);
    return null;
  }

  const dataSource = await addGeoJsonLayer(viewer, {
    data,
    name: option.layerName || option.label || option.value,
    clampToGround: true,
    pickable: option.pickable === true,
    defaultColor: option.fillColor || DEFAULT_FILL_COLOR,
    fillOpacity: option.fillOpacity ?? DEFAULT_FILL_OPACITY,
    lineColor: option.strokeColor || DEFAULT_STROKE_COLOR,
    defaultOutlineWidth: option.strokeWidth ?? DEFAULT_STROKE_WIDTH,
    zIndex: -1,
  });

  if (!dataSource || viewer.isDestroyed()) return null;

  // 填充做成影像层（垫在业务图层下面）；失败就保留上面的矢量面兜底
  const geometries = features
    .map((feature) => feature?.geometry)
    .filter(Boolean);
  const imageryLayer = viewer.isDestroyed()
    ? null
    : addFillImagery(viewer, geometries, option);
  if (imageryLayer) hidePolygons(dataSource);

  addNameLabels(dataSource, {
    showLabel,
    labelField: nameField,
    labelFont: option.labelFont,
    labelColor: option.labelColor,
    labelOutlineColor: option.labelOutlineColor,
    labelOutlineWidth: option.labelOutlineWidth,
    // 标注排除词：如 ["飞地"]，不展示「示例城市飞地」这类标注（面照常渲染）
    excludeKeywords: option.labelExclude,
  });

  return { dataSource, imageryLayer };
}

/**
 * 摘除 addQueryLayer 加载的图层（影像填充 + 矢量边界 / 标注一起摘）
 *
 * @param {Cesium.Viewer} viewer - Cesium Viewer 实例
 * @param {{dataSource: Cesium.GeoJsonDataSource, imageryLayer: Cesium.ImageryLayer|null}} layer
 *   addQueryLayer 的返回值
 */
export function removeQueryLayer(viewer, layer) {
  if (!viewer || viewer.isDestroyed() || !layer) return;

  if (layer.imageryLayer) {
    viewer.imageryLayers.remove(layer.imageryLayer, true);
  }
  if (layer.dataSource) {
    removeGeoJsonLayer(viewer, layer.dataSource);
  }
}

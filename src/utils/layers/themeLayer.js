import * as Cesium from "cesium";
import { wfsUrl } from "@/utils/appConfig";
import { addWMTSLayer, removeWMTSLayer } from "./wmts";
import { add3DTilesLayer, remove3DTilesLayer } from "./threeDTiles";
import { addQueryLayer, removeQueryLayer } from "./queryLayer";
import { addGeoJsonThemeLayer, removeGeoJsonThemeLayer } from "./geojsonTheme";
import { addMarkerLayer, removeMarkerLayer } from "./markers";
import { addNameLabels } from "./labels";

/**
 * 图层加载 —— 按选项的 `type` 分发
 *
 * 选项表来自 `public/config/app.js` 的 `themeOptions`，每条带一个 `type`：
 *
 *   type: "wfs"      WFS GetFeature 取 GeoJSON，前端渲染并标注；
 *                    字段：service（mapServices 的 key）/ typeName / showLabel
 *   type: "query"    查询服务取整层 WKT（`/query?withGeometry=true`）；
 *                    字段：serverName / queryLayerName / nameField / 样式...
 *   type: "geojson"  静态 GeoJSON 文件；字段：url / 样式 / labelField / showLabel
 *   type: "markers"  配置里直接写死的标注点；字段：points / pixelHeight / modelUrl
 *   type: "wmts"     OGC WMTS 影像图层；字段：url / layer / style / 矩阵集 / 级号
 *   type: "3dtiles"  3D Tiles；字段：url（tileset.json）/ maximumScreenSpaceError
 *
 * 缺 `type` 的历史条目按 wfs 处理。各种类型的底层分别是 DataSource /
 * ImageryLayer / Cesium3DTileset，调用方不必区分：`addThemeLayer` 统一返回
 * 句柄 `{ type, layer }`，交给 `removeThemeLayer` 摘除。
 *
 * `geojson` 与 `query` 的 layer 是 `{ dataSource, imageryLayer }`（填充是影像层、
 * 边界是矢量），摘除时两层一起摘；`markers` 的 layer 是 CustomDataSource。
 */

// ============================================================
// WFS —— 要素图层
// ============================================================

/**
 * WFS GetFeature 地址：选项只给 mapServices 的 key，这里拼出完整地址
 * @param {object} option
 * @returns {string}
 */
function buildWfsUrl(option) {
  const wfsParams = new URLSearchParams({
    service: "WFS",
    version: "2.0.0",
    request: "GetFeature",
    typeNames: option.typeName,
    outputFormat: "GEOJSON",
  });

  return `${wfsUrl(option.service)}?${wfsParams.toString()}`;
}

// ============================================================
// 注册表：type → 加载 / 摘除
// ============================================================

const LOADERS = {
  wfs: {
    async add(viewer, option) {
      const dataSource = await Cesium.GeoJsonDataSource.load(
        buildWfsUrl(option),
      );

      // 异步加载期间 viewer 可能已被销毁（路由切换 / 重建）：
      // 直接丢弃，别把图层挂到已销毁的 viewer 上；新 viewer 就绪后会重新加载一次
      if (viewer.isDestroyed()) return null;

      viewer.dataSources.add(dataSource);
      addNameLabels(dataSource, option);
      return dataSource;
    },
    remove(viewer, layer) {
      viewer.dataSources.remove(layer);
    },
  },

  // 查询服务取 WKT，前端按 WFS 的方式加载（通用能力，当前配置未使用）
  query: {
    add(viewer, option) {
      return addQueryLayer(viewer, option);
    },
    remove(viewer, layer) {
      removeQueryLayer(viewer, layer);
    },
  },

  // 静态 GeoJSON 文件（public/geojson/ 下），不请求 GIS 服务 —— 示例页面区域面用（内未配置时同一份配置）
  geojson: {
    add(viewer, option) {
      return addGeoJsonThemeLayer(viewer, option);
    },
    remove(viewer, layer) {
      removeGeoJsonThemeLayer(viewer, layer);
    },
  },

  // 静态标注点（三维图钉 + 名称），点位直接写在配置里，不请求服务
  markers: {
    add(viewer, option) {
      return addMarkerLayer(viewer, option);
    },
    remove(viewer, layer) {
      removeMarkerLayer(viewer, layer);
    },
  },

  wmts: {
    add(viewer, option) {
      // 只取 provider 需要的字段，别把 label / layerId 这些塞进去
      const {
        url,
        layer,
        style,
        format,
        tileMatrixSetID,
        tilingScheme,
        minimumLevel,
        maximumLevel,
        tileMatrixLabels,
        levelOffset,
        rectangle,
        alpha,
      } = option;

      return addWMTSLayer(viewer, {
        url,
        layer,
        style,
        format,
        tileMatrixSetID,
        tilingScheme,
        minimumLevel,
        maximumLevel,
        tileMatrixLabels,
        levelOffset,
        rectangle,
        alpha,
      });
    },
    remove(viewer, layer) {
      removeWMTSLayer(viewer, layer);
    },
  },

  "3dtiles": {
    async add(viewer, option) {
      if (!viewer || viewer.isDestroyed()) return null;

      // 只取 tileset 需要的字段，别把 label / layerId / group 这些塞进 Cesium 的参数
      const tileset = await add3DTilesLayer(viewer, {
        url: option.url,
        name: option.name || option.label || option.value,
        maximumScreenSpaceError: option.maximumScreenSpaceError,
        maximumMemoryUsage: option.maximumMemoryUsage,
      });

      // 异步加载期间 viewer 被销毁：场景已销毁，这个 tileset 没有引用意义
      return viewer.isDestroyed() ? null : tileset;
    },
    remove(viewer, layer) {
      remove3DTilesLayer(viewer, layer);
    },
  },
};

// ============================================================
// 对外接口
// ============================================================

/**
 * 取选项的图层类型，缺省按 wfs（历史条目没写 type）
 * @param {object} option
 * @returns {"wfs"|"query"|"geojson"|"markers"|"wmts"|"3dtiles"|string}
 */
export function getThemeLayerType(option = {}) {
  return option.type || "wfs";
}

/**
 * 选项是否具备加载条件（wfs 要 service + typeName，query 要 serverName，
 * geojson / wmts / 3dtiles 要 url，markers 要非空 points）
 *
 * 未配置的 tab 用的是 `{ label, value }` 占位项，靠这个判断短路掉、不发请求。
 * query 的地址由 `themeQueryRoot` 拼出，未配置时为空串 —— 加载时静默跳过。
 *
 * @param {object} option
 * @returns {boolean}
 */
export function canLoadThemeOption(option = {}) {
  const type = getThemeLayerType(option);

  if (!LOADERS[type]) return false;
  if (type === "wmts" || type === "3dtiles" || type === "geojson") {
    return Boolean(option.url);
  }
  if (type === "markers") {
    return Array.isArray(option.points) && option.points.length > 0;
  }
  if (type === "query") return Boolean(option.serverName);

  return Boolean(option.service && option.typeName);
}

/**
 * 按选项加载专题图层
 *
 * @param {Cesium.Viewer} viewer - Cesium Viewer 实例
 * @param {object} option - themeOptions 里的一项
 * @returns {Promise<{type: string, layer: object}|null>} 句柄；viewer 不可用或加载失败返回 null
 */
export async function addThemeLayer(viewer, option = {}) {
  const type = getThemeLayerType(option);
  const loader = LOADERS[type];

  if (!loader) {
    console.error(
      `[themeLayer] 未知的专题图层 type: ${type}（选项 ${option.value}）`,
    );
    return null;
  }
  if (!viewer || viewer.isDestroyed()) return null;

  const layer = await loader.add(viewer, option);
  if (!layer || viewer.isDestroyed()) return null;

  return { type, layer };
}

/**
 * 摘除 addThemeLayer 返回的图层
 *
 * @param {Cesium.Viewer} viewer - Cesium Viewer 实例
 * @param {{type: string, layer: object}|null} handle - addThemeLayer 的返回值
 */
export function removeThemeLayer(viewer, handle) {
  if (!viewer || viewer.isDestroyed() || !handle?.layer) return;

  LOADERS[handle.type]?.remove(viewer, handle.layer);
}

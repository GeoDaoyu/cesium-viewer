import * as Cesium from "cesium";
import { toBoundaryLineCollection } from "@/utils/geojsonBoundary";
import { addGeoJsonLayer, removeGeoJsonLayer } from "./geojson";
import { addNameLabels } from "./labels";
import { addFillImagery } from "./queryLayer";

/**
 * 静态 GeoJSON 文件 → 面图层（`type: "geojson"`）
 *
 * 数据不请求 GIS 服务，直接加载 `public/geojson/` 下的 `.geojson` 文件：
 * 随前端一起部署，换数据只替换文件。GeoJSON 规范强制 WGS84，可直接使用。
 *
 * 画法与 `queryLayer.js` 一致，拆成两层（原因见该文件头注释）：
 *
 * 1. **填充 = 影像层**（`fillImagery.js`）：把面几何客户端栅格化成纯色瓦片，
 *    垫在业务切片图层下面；
 * 2. **边界 = 矢量数据源**：贴地面图元不支持描边，把每个面环拆成 LineString
 *    单独画线；面要素保留但只在填充影像创建失败时兜底显示。
 *
 * **名称标注也画在这一层**（`labels.js` 的 `addNameLabels()`）：标注是实体 label，
 * 永远压在填充影像与业务图层之上；数据源默认 `pickable: false`，点击可穿透。
 *
 * 所有颜色 / 透明度 / 线宽 / 标注样式都在配置条目里，见 `public/config/app.js`。
 */

/** 填充色：RGB 241/248/233（浅绿白，作为地级市的底色） */
const DEFAULT_FILL_COLOR = "#f1f8e9";

/** 填充不透明度：现场要求纯色填充，透明会让卫星影像透出来、改色失真 */
const DEFAULT_FILL_OPACITY = 1;

/** 轮廓色：RGB 76/115/0（深橄榄绿） */
const DEFAULT_STROKE_COLOR = "#4c7300";

/** 轮廓宽度（pt）——Cesium 的线宽是像素，加载时按 96dpi 折算，见 `ptToPx()` */
const DEFAULT_STROKE_WIDTH_PT = 0.7;

/** 名称标注的默认样式（不透明白色字 + 深色描边，浅色填充上也清晰） */
const DEFAULT_LABEL_FONT = "14px sans-serif";
const DEFAULT_LABEL_COLOR = "#ffffff";
const DEFAULT_LABEL_OUTLINE_COLOR = "#333333";
const DEFAULT_LABEL_OUTLINE_WIDTH = 3;

/**
 * pt → CSS 像素（96 dpi：1pt = 96/72 px）
 *
 * Cesium 的 `polyline.width` 单位是像素，配置里按设计稿写 0.7pt，
 * 折算后约 0.93px；不要直接写 0.7，否则在高分屏上会偏细。
 *
 * @param {number} pt - 磅值
 * @returns {number} 像素值
 */
export function ptToPx(pt) {
  return (Number(pt) * 96) / 72;
}

/**
 * 拉取并校验 GeoJSON 文件
 *
 * 地址相对页面（`publicPath` 为 "./"），文件名用 ASCII，避免静态服务器 / 压缩包
 * 对中文文件名的编码差异。
 *
 * @param {string} url - 相对 / 绝对地址
 * @returns {Promise<object>} FeatureCollection
 */
async function fetchGeoJson(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(
      `加载 GeoJSON 失败：${response.status} ${response.statusText}`,
    );
  }

  const data = await response.json();
  if (!data || !Array.isArray(data.features)) {
    throw new Error("GeoJSON 不是合法的 FeatureCollection");
  }

  return data;
}

/**
 * 多个几何 → 只描边的 LineString 要素集合
 *
 * 面几何拆环、线几何原样保留（数据里带 2 条「境界线」MultiLineString）。
 *
 * @param {Array<object>} geometries - GeoJSON 几何数组
 * @returns {{type: "FeatureCollection", features: object[]}}
 */
function buildBoundaryCollection(geometries) {
  const features = [];

  for (const geometry of geometries) {
    const boundary = toBoundaryLineCollection(geometry);
    for (const line of boundary.features) features.push(line);
  }

  return { type: "FeatureCollection", features };
}

/**
 * 面要素 + 边界线 → 数据源用的 FeatureCollection
 *
 * 面要素带属性（可供以后的属性查询用），但填充成功后会被隐藏；边界线不带属性。
 *
 * @param {Array<{properties?: object, geometry?: object}>} features
 * @returns {{data: object, geometries: object[]}}
 */
function buildLayerData(features) {
  const dataFeatures = [];
  const geometries = [];

  for (const feature of features) {
    const geometry = feature?.geometry;
    if (!geometry) continue;

    geometries.push(geometry);

    // 线要素（境界线）只进边界集合，避免同一批线被画两遍
    if (geometry.type !== "Polygon" && geometry.type !== "MultiPolygon") {
      continue;
    }

    dataFeatures.push({
      type: "Feature",
      properties: feature.properties || {},
      geometry,
    });
  }

  const boundary = buildBoundaryCollection(geometries);
  for (const line of boundary.features) dataFeatures.push(line);

  return {
    data: { type: "FeatureCollection", features: dataFeatures },
    geometries,
  };
}

/**
 * 隐藏数据源里的面要素（只保留边界线；填充交给影像层）
 * @param {Cesium.GeoJsonDataSource} dataSource
 */
function hidePolygons(dataSource, keepPickable = false) {
  for (const entity of dataSource.entities.values) {
    if (!entity.polygon) continue;

    if (keepPickable) {
      // 填充已经由影像层负责；面本身保留为完全透明、不描边，
      // 只为点击拾取留一个几何（透明材质仍会进入 pick buffer）
      entity.polygon.material = Cesium.Color.TRANSPARENT;
      entity.polygon.outline = false;
    } else {
      entity.polygon.show = false;
    }
  }
}

/**
 * 加载静态 GeoJSON 区域面图层
 *
 * @param {Cesium.Viewer} viewer - Cesium Viewer 实例
 * @param {object} option - themeOptions 里 type 为 "geojson" 的一项
 * @param {string} option.url - GeoJSON 文件地址（相对页面，如 "./geojson/demo-areas.geojson"）
 * @param {string} [option.fillColor="#f1f8e9"] - 填充色
 * @param {number} [option.fillOpacity=1] - 填充不透明度
 * @param {string} [option.strokeColor="#4c7300"] - 轮廓色
 * @param {number} [option.strokeWidth=0.7] - 轮廓宽度（pt）
 * @param {boolean} [option.pickable=false] - 是否参与点击 / 悬停拾取
 * @param {string} [option.labelField="name"] - 名称字段（忽略大小写）
 * @param {boolean} [option.showLabel=true] - 是否标注名称（没有 center 字段时按最大面块的
 *   几何中心标注；GeoJSON 自带 center 时优先用它）
 * @param {string} [option.labelFont="14px sans-serif"] - 标注字体
 * @param {string} [option.labelColor="#ffffff"] - 标注文字颜色（不透明白色）
 * @param {string} [option.labelOutlineColor="#333333"] - 标注描边颜色
 * @param {number} [option.labelOutlineWidth=3] - 标注描边宽度
 * @param {string[]} [option.labelExclude] - 标注排除词：名称包含其中任意一个就不标注
 * @param {number} [option.fillMinimumLevel] - 填充影像最低级别（默认 6）
 * @param {number} [option.fillMaximumLevel] - 填充影像最高级别（默认 18）
 * @returns {Promise<{dataSource: Cesium.GeoJsonDataSource, imageryLayer: Cesium.ImageryLayer|null}|null>}
 *   地址缺失 / 加载失败 / 没有几何时返回 null
 */
export async function addGeoJsonThemeLayer(viewer, option = {}) {
  if (!viewer || viewer.isDestroyed() || !option.url) return null;

  const data = await fetchGeoJson(option.url);

  // 异步加载期间 viewer 可能已被销毁（路由切换 / 重建）：直接丢弃
  if (viewer.isDestroyed()) return null;

  const { data: layerData, geometries } = buildLayerData(data.features);
  if (geometries.length === 0) {
    console.warn(`[geojsonTheme] ${option.url} 没有可用几何`);
    return null;
  }

  const dataSource = await addGeoJsonLayer(viewer, {
    data: layerData,
    name: option.layerName || option.label || option.value,
    clampToGround: true,
    pickable: option.pickable === true,
    defaultColor: option.fillColor || DEFAULT_FILL_COLOR,
    fillOpacity: option.fillOpacity ?? DEFAULT_FILL_OPACITY,
    lineColor: option.strokeColor || DEFAULT_STROKE_COLOR,
    // 线宽直接取折算后的像素，不能再走 applyDataSourceStyle 的 +1
    lineWidth: ptToPx(option.strokeWidth ?? DEFAULT_STROKE_WIDTH_PT),
    zIndex: -1,
  });

  if (!dataSource || viewer.isDestroyed()) return null;

  // 填充做成影像层（垫在专题图下面）；失败就保留矢量面兜底
  const imageryLayer = viewer.isDestroyed()
    ? null
    : addFillImagery(viewer, geometries, {
        ...option,
        fillColor: option.fillColor || DEFAULT_FILL_COLOR,
        fillOpacity: option.fillOpacity ?? DEFAULT_FILL_OPACITY,
      });
  if (imageryLayer) hidePolygons(dataSource, option.pickable === true);

  // 名称标注（底图已去掉底图注记，城市名由这份 GeoJSON 的 name 字段提供）。
  // 标注是实体 label，永远压在填充影像 / 专题图 WMTS 之上；面要素仍是隐藏的，
  // 只为标注提供锚点与属性。`showLabel: true` 表示没有 center 字段时按几何中心标注
  // （文件只有 name / gb，所以走几何中心；带 center 的 GeoJSON 会优先用 center）。
  if (option.showLabel !== false) {
    addNameLabels(dataSource, {
      showLabel: true,
      labelField: option.labelField || "name",
      labelFont: option.labelFont || DEFAULT_LABEL_FONT,
      labelColor: option.labelColor || DEFAULT_LABEL_COLOR,
      labelOutlineColor:
        option.labelOutlineColor || DEFAULT_LABEL_OUTLINE_COLOR,
      labelOutlineWidth:
        option.labelOutlineWidth ?? DEFAULT_LABEL_OUTLINE_WIDTH,
      excludeKeywords: option.labelExclude,
    });
  }

  return { dataSource, imageryLayer };
}

/**
 * 摘除 addGeoJsonThemeLayer 加载的图层（影像填充 + 矢量边界一起摘）
 *
 * @param {Cesium.Viewer} viewer - Cesium Viewer 实例
 * @param {{dataSource: Cesium.GeoJsonDataSource, imageryLayer: Cesium.ImageryLayer|null}} layer
 *   addGeoJsonThemeLayer 的返回值
 */
export function removeGeoJsonThemeLayer(viewer, layer) {
  if (!viewer || viewer.isDestroyed() || !layer) return;

  if (layer.imageryLayer) {
    viewer.imageryLayers.remove(layer.imageryLayer, true);
  }
  if (layer.dataSource) {
    removeGeoJsonLayer(viewer, layer.dataSource);
  }
}

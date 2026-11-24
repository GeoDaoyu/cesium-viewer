import * as Cesium from "cesium";

/**
 * 矢量面图层的名称标注
 *
 * 三处共用：
 * - WFS 图层（`themeLayer.js` 的 wfs 分支）
 * - 「查询服务取 WKT」图层（`queryLayer.js`，通用能力）
 * - 静态 GeoJSON 区域面（`geojsonTheme.js`，名称由本层标注）
 *
 * 三者加载出来的都是 `GeoJsonDataSource`，标注规则完全一样，差别只在数据来源。
 *
 * 规则：
 * 1. 名称字段按 `labelField` 取（默认 name，忽略大小写 —— 各服务字段名大小写不统一）；
 * 2. 数据自带 `center`（"lon,lat" 字符串 / 数组）时直接用作锚点 —— 区域面这类
 *    数据自带中心点，比几何中心更贴切；解析不出来就退回几何质心；
 * 3. 缺 center 且 `showLabel` 为真时，取包围球半径最大的那块多边形的质心
 *    （Cesium 会把 MultiPolygon 拆成多个实体，沿海多岛城市逐个标注会产生大量重复标签）；
 * 4. 同一名称只标一次。
 */

/** 大小写不敏感地取属性值（服务字段大小写不统一，如 NAME / name） */
function readField(properties, field) {
  if (!properties || !field) return undefined;
  if (properties[field] !== undefined) return properties[field];

  const lower = String(field).toLowerCase();
  const key = Object.keys(properties).find(
    (name) => name.toLowerCase() === lower,
  );
  return key === undefined ? undefined : properties[key];
}

/**
 * center 字段 → [lon, lat]
 *
 * 兼容数组、JSON 字符串（"[113.2,23.1]"）、逗号 / 空格分隔字符串（"113.2,23.1"）。
 * 解析不出来返回 null，由调用方退回几何质心。
 *
 * @param {any} value - 服务返回的 center 字段
 * @returns {[number, number]|null}
 */
function parseCenter(value) {
  if (Array.isArray(value)) {
    const lon = Number(value[0]);
    const lat = Number(value[1]);
    return Number.isFinite(lon) && Number.isFinite(lat) ? [lon, lat] : null;
  }

  if (typeof value !== "string") return null;

  const text = value.trim();
  if (!text) return null;

  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) return parseCenter(parsed);
  } catch {
    // 不是 JSON：按分隔符再拆一次
  }

  const parts = text.split(/[,\s]+/).map(Number);
  if (
    parts.length >= 2 &&
    Number.isFinite(parts[0]) &&
    Number.isFinite(parts[1])
  ) {
    return [parts[0], parts[1]];
  }

  return null;
}

/**
 * 从 polygon 几何计算包围球（标注锚点用）
 * 支持 Polygon 和 MultiPolygon
 */
function computePolygonBoundingSphere(polygon) {
  try {
    const hierarchy = polygon.hierarchy?.getValue?.() ?? polygon.hierarchy;
    if (!hierarchy) return null;

    let positions;
    if (Cesium.defined(hierarchy.positions)) {
      positions = hierarchy.positions;
    } else if (Array.isArray(hierarchy) && hierarchy.length > 0) {
      positions = hierarchy[0].positions;
    } else {
      return null;
    }

    if (!positions || positions.length === 0) return null;
    return Cesium.BoundingSphere.fromPoints(positions);
  } catch {
    return null;
  }
}

/**
 * 名称是否命中排除词
 *
 * `["飞地"]` 会把「示例城市飞地」这类标注过滤掉（名称里包含也算），
 * 面本身仍照常渲染 —— 只影响 label。
 *
 * @param {string} name - 要素名称
 * @param {string[]} keywords - 排除词
 * @returns {boolean}
 */
function isExcludedLabel(name, keywords) {
  if (!Array.isArray(keywords) || keywords.length === 0) return false;

  const text = String(name);
  return keywords.some((keyword) => {
    const word = String(keyword ?? "").trim();
    return word !== "" && text.includes(word);
  });
}

/**
 * 给数据源里的面要素加名称标签
 *
 * @param {Cesium.GeoJsonDataSource} dataSource - 已加载的数据源
 * @param {object} [option]
 * @param {boolean} [option.showLabel=false] - 没有 center 字段时是否按几何质心标注
 * @param {string} [option.labelField="name"] - 名称字段（忽略大小写）
 * @param {string} [option.centerField="center"] - 数据自带中心点字段（忽略大小写）
 * @param {string} [option.labelFont="14px sans-serif"] - 字体
 * @param {string} [option.labelColor="#ffffff"] - 文字颜色（CSS 颜色串）
 * @param {string} [option.labelOutlineColor="#333333"] - 描边颜色
 * @param {number} [option.labelOutlineWidth=3] - 描边宽度
 * @param {string[]} [option.excludeKeywords] - 排除词：名称包含其中任意一个就不标注
 *   （如 `["飞地"]` 隐藏「示例城市飞地」这类分区标注；面本身照常渲染）
 */
export function addNameLabels(dataSource, option = {}) {
  if (!dataSource?.entities) return;

  const {
    showLabel = false,
    labelField = "name",
    centerField = "center",
    labelFont = "14px sans-serif",
    labelColor = "#ffffff",
    labelOutlineColor = "#333333",
    labelOutlineWidth = 3,
    excludeKeywords = [],
  } = option;

  const entities = dataSource.entities.values;

  // 第一遍：每个名称只保留一个最合适的标注锚点实体
  const labelAnchors = new Map(); // name -> { entity, center, radius }
  for (let i = 0; i < entities.length; i++) {
    const entity = entities[i];
    if (!entity.polygon) continue;

    const props = entity.properties?.getValue?.() ?? {};
    const entityName = readField(props, labelField);
    if (!entityName) continue;

    // 名称命中排除词（如「示例城市飞地」）：只跳过标注，面照常渲染
    if (isExcludedLabel(entityName, excludeKeywords)) continue;

    const center = parseCenter(readField(props, centerField));

    // 数据自带 center：各拆分实体 center 相同，取首个即可
    if (center) {
      if (!labelAnchors.has(entityName)) {
        labelAnchors.set(entityName, { entity, center, radius: Infinity });
      }
      continue;
    }

    // 无 center（showLabel 图层）：选包围球半径最大的部分作为锚点
    if (!showLabel) continue;

    const bs = computePolygonBoundingSphere(entity.polygon);
    if (!bs) continue;

    const prev = labelAnchors.get(entityName);
    if (!prev || bs.radius > prev.radius) {
      labelAnchors.set(entityName, { entity, center: null, radius: bs.radius });
    }
  }

  // 第二遍：给每个名称添加一个 label
  const fillColor =
    Cesium.Color.fromCssColorString(labelColor) ?? Cesium.Color.WHITE;
  const outlineColor =
    Cesium.Color.fromCssColorString(labelOutlineColor) ?? Cesium.Color.BLACK;

  for (const [entityName, { entity, center }] of labelAnchors) {
    let position = null;

    if (center) {
      position = Cesium.Cartesian3.fromDegrees(center[0], center[1]);
    } else {
      const bs = computePolygonBoundingSphere(entity.polygon);
      position = bs ? bs.center : null;
    }
    if (!position) continue;

    entity.position = position;
    entity.label = {
      text: String(entityName),
      font: labelFont,
      fillColor,
      outlineColor,
      outlineWidth: labelOutlineWidth,
      style: Cesium.LabelStyle.FILL_AND_OUTLINE,
      horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
      verticalOrigin: Cesium.VerticalOrigin.CENTER,
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
    };
  }
}

import * as Cesium from "cesium";

/**
 * 高亮要素
 *
 * 在 WFS 图层中通过要素 ID 找到对应实体，保存原始样式后替换为高亮样式，
 * 返回恢复函数用于取消高亮。
 *
 * 同时只支持高亮一个要素：再次调用前应先执行上一次返回的 restore()。
 *
 * @param {Cesium.GeoJsonDataSource} dataSource - WFS 数据源
 * @param {string|number} featureId - 要素 ID（对应 GeoJSON feature.id）
 * @param {object} [options]
 * @param {Cesium.Color} [options.color=Cesium.Color.RED] - 高亮颜色
 * @param {number} [options.alpha=0.9] - 填充透明度（仅多边形）
 * @param {number} [options.outlineWidth=3] - 轮廓/边框宽度
 * @param {number} [options.pointSize=12] - 点要素大小
 * @returns {Function} restore - 调用恢复原始样式，若无匹配实体则返回 noop
 *
 * @example
 * const restore = highlightFeature(dataSource, item.id);
 * // 切换高亮前先取消上一个
 * restoreRef.current?.();
 * restoreRef.current = highlightFeature(dataSource, nextItem.id);
 */
export function highlightFeature(dataSource, featureId, options = {}) {
  const {
    color = Cesium.Color.RED,
    alpha = 0.9,
    outlineWidth = 3,
    pointSize = 12,
  } = options;

  const entity = dataSource.entities.getById(String(featureId));
  if (!entity) return () => {};

  // ---- 保存原始样式 ----
  const original = {};

  if (entity.point) {
    original.point = {
      color: entity.point.color?.getValue(),
      pixelSize: entity.point.pixelSize?.getValue(),
      outlineColor: entity.point.outlineColor?.getValue(),
      outlineWidth: entity.point.outlineWidth?.getValue(),
    };
  }

  if (entity.polygon) {
    original.polygon = {
      material: entity.polygon.material,
      outline: entity.polygon.outline?.getValue(),
      outlineColor: entity.polygon.outlineColor?.getValue(),
      outlineWidth: entity.polygon.outlineWidth?.getValue(),
      zIndex: entity.polygon.zIndex?.getValue(),
    };
  }

  if (entity.polyline) {
    original.polyline = {
      material: entity.polyline.material,
      width: entity.polyline.width?.getValue(),
    };
  }

  // ---- 应用高亮样式 ----
  if (entity.point) {
    entity.point.color = color;
    entity.point.pixelSize = pointSize;
    entity.point.outlineColor = Cesium.Color.WHITE;
    entity.point.outlineWidth = outlineWidth;
  }

  if (entity.polygon) {
    entity.polygon.material = color.withAlpha(alpha);
    entity.polygon.outline = true;
    entity.polygon.outlineColor = color;
    entity.polygon.outlineWidth = outlineWidth;
    entity.polygon.zIndex = 999; // 高亮要素置顶
  }

  if (entity.polyline) {
    entity.polyline.material = color;
    entity.polyline.width = outlineWidth;
  }

  // ---- 恢复函数 ----
  return () => {
    if (original.point) {
      entity.point.color = original.point.color ?? Cesium.Color.WHITE;
      entity.point.pixelSize = original.point.pixelSize ?? 8;
      entity.point.outlineColor =
        original.point.outlineColor ?? Cesium.Color.BLACK;
      entity.point.outlineWidth = original.point.outlineWidth ?? 1;
    }

    if (original.polygon) {
      entity.polygon.material =
        original.polygon.material ?? Cesium.Color.YELLOW.withAlpha(0.4);
      entity.polygon.outline = original.polygon.outline ?? true;
      entity.polygon.outlineColor =
        original.polygon.outlineColor ?? Cesium.Color.YELLOW;
      entity.polygon.outlineWidth = original.polygon.outlineWidth ?? 1;
      entity.polygon.zIndex = original.polygon.zIndex;
    }

    if (original.polyline) {
      entity.polyline.material =
        original.polyline.material ?? Cesium.Color.YELLOW;
      entity.polyline.width = original.polyline.width ?? 2;
    }
  };
}

/**
 * 当前实体高亮的恢复函数（地图上同时只保留一份）
 *
 * 点击业务实体时 CesiumViewer 用 `highlightFeature()` 直接改实体自身样式，
 * 这不是独立的数据源，`viewer.dataSources` 扫不到。把 restore 放在模块级，
 * 「清除高亮」按钮才能连同这份一起恢复（`utils/highlights.js` 的
 * `clearAllHighlights()` 会调 `clearEntityHighlight()`）。
 */
let currentRestore = null;

/**
 * 登记实体高亮（会先恢复上一次的样式）
 *
 * @param {Function} restore - `highlightFeature()` 的返回值
 */
export function setEntityHighlight(restore) {
  currentRestore?.();
  currentRestore = typeof restore === "function" ? restore : null;
}

/** 恢复实体原始样式（点空白处 / 清除高亮时调用） */
export function clearEntityHighlight() {
  currentRestore?.();
  currentRestore = null;
}

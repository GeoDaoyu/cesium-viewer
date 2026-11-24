/**
 * 面几何 → 贴地边界线
 *
 * Cesium 的贴地面图元（`clampToGround`）不支持描边，`polygon.outline` 会被忽略。
 * 要在贴地的面上画边界，只能把每个面环拆成 LineString 单独画线；本模块负责
 * 这个转换，供查询服务图层与静态 GeoJSON 图层共用。
 *
 * 只处理面 / 线：点是另一套图元（点标记），不需要边界。
 */

/**
 * 面几何 → 只描边的 LineString 要素集合
 *
 * 每个环（外环 + 内环）一条 LineString，`GeometryCollection` 递归处理，
 * 线上原有的 `LineString` / `MultiLineString` 原样保留；点 / 多点在区域面
 * 服务里不会出现，忽略。
 *
 * @param {object} geometry - GeoJSON 几何（POLYGON / MULTIPOLYGON / ...）
 * @returns {{type: "FeatureCollection", features: object[]}}
 */
export function toBoundaryLineCollection(geometry) {
  const features = [];

  const pushLine = (coordinates) => {
    if (!Array.isArray(coordinates) || coordinates.length < 2) return;
    features.push({
      type: "Feature",
      properties: {},
      geometry: { type: "LineString", coordinates },
    });
  };

  const walk = (g) => {
    if (!g) return;

    if (g.type === "Polygon") {
      (g.coordinates || []).forEach(pushLine);
    } else if (g.type === "MultiPolygon") {
      (g.coordinates || []).forEach((polygon) =>
        (polygon || []).forEach(pushLine),
      );
    } else if (g.type === "GeometryCollection") {
      (g.geometries || []).forEach(walk);
    } else if (g.type === "LineString") {
      pushLine(g.coordinates);
    } else if (g.type === "MultiLineString") {
      (g.coordinates || []).forEach(pushLine);
    }
  };

  walk(geometry);

  return { type: "FeatureCollection", features };
}

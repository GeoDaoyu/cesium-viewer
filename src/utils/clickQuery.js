import * as Cesium from "cesium";

/**
 * 点击位置 → 经纬度 / 闭合小矩形
 *
 * 点图查询用 `spatialFilter` 接收 WKT：以点击点为中心构造一个很小的闭合矩形
 * （容差 `0.0001°`）作为空间过滤条件，避免全表查询。
 */

/** 点击容差（度）。0.0001° 约 11m，因此点击框约 20m × 22m */
export const CLICK_QUERY_TOLERANCE_DEG = 0.0001;

/**
 * 以点击点为中心构造一个小闭合矩形 WKT
 *
 * @param {number} lon - 经度（WGS84）
 * @param {number} lat - 纬度（WGS84）
 * @param {number} [tolerance] - 容差（度）
 * @returns {string} WKT POLYGON
 */
export function buildClickPolygon(
  lon,
  lat,
  tolerance = CLICK_QUERY_TOLERANCE_DEG,
) {
  // 定点到 7 位小数（约 1cm），避免加减容差后出现 113.40010000000001 这类浮点噪声
  const round = (value) => Number(value.toFixed(7));

  const west = round(lon - tolerance);
  const east = round(lon + tolerance);
  const south = round(lat - tolerance);
  const north = round(lat + tolerance);
  // 首尾坐标相同才算闭合
  return (
    `POLYGON((${west} ${south},${east} ${south},` +
    `${east} ${north},${west} ${north},${west} ${south}))`
  );
}

/**
 * 取屏幕点击点对应的经纬度
 *
 * 优先用 `globe.pick()` 求交，拿到的是**地形表面**上的点（挂了三维地形，
 * 山坡上点击时若用椭球求交，横向会偏出几十到上百米）；地形瓦片还没加载好
 * （返回 undefined）或没挂地形时，回退到射线与椭球的交点。点到天空时返回 null。
 *
 * @param {Cesium.Viewer} viewer
 * @param {Cesium.Cartesian2} screenPosition
 * @returns {{lon: number, lat: number}|null}
 */
export function pickLonLat(viewer, screenPosition) {
  if (!viewer || viewer.isDestroyed()) return null;

  const { scene } = viewer;
  const ellipsoid = scene.globe?.ellipsoid ?? Cesium.Ellipsoid.WGS84;

  const ray = viewer.camera.getPickRay(screenPosition);
  const picked = ray ? scene.globe.pick(ray, scene) : undefined;
  const cartesian =
    picked ?? viewer.camera.pickEllipsoid(screenPosition, ellipsoid);
  if (!cartesian) return null;

  const cartographic = Cesium.Cartographic.fromCartesian(cartesian);
  return {
    lon: Cesium.Math.toDegrees(cartographic.longitude),
    lat: Cesium.Math.toDegrees(cartographic.latitude),
  };
}

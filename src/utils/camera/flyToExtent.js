/**
 * 相机飞行到「服务范围」
 *
 * 勾选图层 / 点击定位按钮时用：
 * - WMTS：范围来自 GetCapabilities 的 WGS84BoundingBox（见 services/wmtsCapabilities.js），
 *   这里把它扩一点边距后交给 `camera.flyTo({ destination: Rectangle })`，视角是正俯视；
 * - 3D Tiles：范围来自加载后的 `tileset.boundingSphere`，用
 *   `flyToBoundingSphere` + HeadingPitchRange 飞到模型上方。
 *
 * 相机操作前统一确认 viewer 可用：路由切换 / 组件卸载后 viewer 可能已销毁，
 * 异步拿到范围再飞时要重新判断，不能只依赖调用时的状态。
 */
import * as Cesium from "cesium";

const DEFAULT_DURATION = 1.6;

/** 范围四周的留白比例（不能按固定度数：小范围会被撑得太大） */
const PADDING_RATIO = 0.08;

/** 范围过小时（单点 / 极窄面）至少留出这么多度，避免相机贴到地面 */
const MIN_PADDING_DEGREES = 0.002;

/** viewer 可能在路由切换时已被销毁，调用相机 API 前先确认可用 */
function isUsable(viewer) {
  return Boolean(viewer) && !viewer.isDestroyed();
}

/**
 * 飞到矩形范围（正俯视）
 *
 * @param {Cesium.Viewer} viewer - Cesium Viewer 实例
 * @param {[number, number, number, number]} extent - `[西, 南, 东, 北]`（度）
 * @param {{duration?: number, onComplete?: Function}} [options]
 *   `onComplete` 在飞行正常结束后调用，用于让联动相机对齐最终视角
 * @returns {boolean} 是否已发起飞行（viewer 不可用 / 范围非法时为 false）
 */
export function flyToExtent(viewer, extent, options = {}) {
  if (!isUsable(viewer) || !Array.isArray(extent)) return false;

  const [west, south, east, north] = extent;
  if (![west, south, east, north].every(Number.isFinite)) return false;
  if (west >= east || south >= north) return false;

  const padX = Math.max((east - west) * PADDING_RATIO, MIN_PADDING_DEGREES);
  const padY = Math.max((north - south) * PADDING_RATIO, MIN_PADDING_DEGREES);

  const rectangle = Cesium.Rectangle.fromDegrees(
    Math.max(west - padX, -180),
    Math.max(south - padY, -90),
    Math.min(east + padX, 180),
    Math.min(north + padY, 90),
  );

  viewer.camera.flyTo({
    destination: rectangle,
    duration: options.duration ?? DEFAULT_DURATION,
    easingFunction: Cesium.EasingFunction.QUADRATIC_IN_OUT,
    complete: options.onComplete,
  });
  return true;
}

/**
 * 飞到 3D Tiles 的包围球
 *
 * 倾斜模型用 -45° 俯仰角看比正俯视更直观；
 * `range` 取包围球半径的 1.5 倍，模型不会贴满屏幕。
 *
 * @param {Cesium.Viewer} viewer - Cesium Viewer 实例
 * @param {Cesium.BoundingSphere} boundingSphere - `tileset.boundingSphere`
 * @param {{duration?: number, heading?: number, pitch?: number, rangeFactor?: number, onComplete?: Function}} [options]
 *   heading / pitch 单位是度；`onComplete` 在飞行结束后调用
 * @returns {boolean} 是否已发起飞行
 */
export function flyToBoundingSphere(viewer, boundingSphere, options = {}) {
  if (!isUsable(viewer) || !boundingSphere) return false;

  const {
    duration = DEFAULT_DURATION,
    heading = 0,
    pitch = -45,
    rangeFactor = 1.5,
    onComplete,
  } = options;

  viewer.camera.flyToBoundingSphere(boundingSphere, {
    duration,
    offset: new Cesium.HeadingPitchRange(
      Cesium.Math.toRadians(heading),
      Cesium.Math.toRadians(pitch),
      boundingSphere.radius * rangeFactor,
    ),
    complete: onComplete,
  });
  return true;
}

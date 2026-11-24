import { homeDestination, homeOrientation } from "@/utils/camera/homeView";

/**
 * 单次缩放移动的距离 = 当前相机高度 × 该比例。
 *
 * 不能用固定米数：默认视角在 600km 高空、pitch -45°，沿视线走 1000km
 * 会直接穿过地面（垂直下落约 707km），相机被碰撞检测按到地表后还会向
 * 北偏出约 700km，画面只剩黑色。按高度等比缩放时，单步的垂直分量最多
 * 是当前高度的 35%，相机永远还剩至少 65% 的高度，不会越过地面。
 */
const ZOOM_STEP_RATIO = 0.35;

/** 贴地时按比例算出的缩小步长太小，给一个下限，否则点一下几乎没有变化 */
const MIN_ZOOM_OUT_STEP = 200;

/** viewer 可能在路由切换时已被销毁，调用相机 API 前先确认可用 */
function isUsable(viewer) {
  return Boolean(viewer) && !viewer.isDestroyed();
}

/** 相机当前的海拔高度（米），贴地或在地下时按 0 处理 */
function cameraHeight(viewer) {
  return Math.max(viewer.camera.positionCartographic.height, 0);
}

/**
 * 飞回默认视角
 *
 * 默认视角只在 `utils/camera/homeView.js` 的 HOME_VIEW 里定义一份，
 * 页面进入时的初始视角也走这里，改一处全站生效。
 * @param {Cesium.Viewer} viewer
 * @param {{ duration?: number }} [options]
 */
export function flyHome(viewer, options = {}) {
  if (!isUsable(viewer)) return;
  viewer.camera.flyTo({
    destination: homeDestination(),
    orientation: homeOrientation(),
    duration: options.duration ?? 1.5,
  });
}

/**
 * 放大（按当前高度等比前进，避免一次点击越过地面）
 * @param {Cesium.Viewer} viewer
 */
export function zoomIn(viewer) {
  if (!isUsable(viewer)) return;
  viewer.camera.zoomIn(cameraHeight(viewer) * ZOOM_STEP_RATIO);
}

/**
 * 缩小（按当前高度等比后退，贴地时保底一个可见步长）
 * @param {Cesium.Viewer} viewer
 */
export function zoomOut(viewer) {
  if (!isUsable(viewer)) return;
  viewer.camera.zoomOut(
    Math.max(cameraHeight(viewer) * ZOOM_STEP_RATIO, MIN_ZOOM_OUT_STEP),
  );
}

/**
 * 重置 heading 到正北方向（保持当前位置和 pitch）
 * @param {Cesium.Viewer} viewer
 * @param {{ duration?: number }} [options]
 */
export function resetHeading(viewer, options = {}) {
  if (!isUsable(viewer)) return;
  const camera = viewer.camera;
  viewer.camera.flyTo({
    destination: camera.position,
    orientation: {
      heading: 0,
      pitch: camera.pitch,
      roll: 0,
    },
    duration: options.duration ?? 0.8,
  });
}

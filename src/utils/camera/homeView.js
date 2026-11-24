import * as Cesium from "cesium";

/**
 * 默认（初始）视角 —— 全站唯一来源
 *
 * 进入页面时的飞入视角、工具栏「回到默认视角」都读这一份；调视角只改这里。
 * 单位：longitude / latitude 为度，height 为相机自身海拔（米，不是离地高度），
 * heading / pitch / roll 为度（pitch -90 是正俯视，-45 是斜视）。
 *
 * 默认对准 public/geojson/demo-areas.geojson 的示例区域。
 */
export const HOME_VIEW = {
  longitude: 116.45,
  latitude: 40.32,
  height: 150000,
  heading: 180,
  pitch: -60,
  roll: 0,
};

/** HOME_VIEW → camera.flyTo 的 destination */
export function homeDestination(view = HOME_VIEW) {
  return Cesium.Cartesian3.fromDegrees(
    view.longitude,
    view.latitude,
    view.height,
  );
}

/** HOME_VIEW → camera.flyTo 的 orientation（Cesium 要弧度） */
export function homeOrientation(view = HOME_VIEW) {
  return {
    heading: Cesium.Math.toRadians(view.heading),
    pitch: Cesium.Math.toRadians(view.pitch),
    roll: Cesium.Math.toRadians(view.roll),
  };
}

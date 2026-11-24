import * as Cesium from "cesium";

/**
 * 相机漫游工具函数
 *
 * 提供视角飞行、串行漫游播放、视角导入导出等功能。
 * 视角数据格式：
 *   { name: string, position: {longitude, latitude, height}, orientation: {heading, pitch, roll} }
 *   其中 heading/pitch/roll 单位为度。
 */

const TWO_PI = Math.PI * 2;

/** 每帧复用的位置结果，避免逐帧新建对象 */
const scratchPosition = new Cesium.Cartesian3();

/** 毫秒时间戳（个别环境没有 performance.now） */
function nowMs() {
  return typeof performance !== "undefined" &&
    typeof performance.now === "function"
    ? performance.now()
    : Date.now();
}

/** 视角位置 → 世界坐标 */
function toCartesian3(position) {
  return Cesium.Cartesian3.fromDegrees(
    position.longitude,
    position.latitude,
    position.height,
  );
}

/** 把角度折算到参考角附近（±180° 内），避免 heading 在 0/360 处插值时绕圈 */
function unwrapAngle(angle, reference) {
  let result = angle;
  while (result - reference > Math.PI) result -= TWO_PI;
  while (result - reference < -Math.PI) result += TWO_PI;
  return result;
}

/** 取下标并把越界值夹到首尾（Catmull-Rom 端点处理） */
function clampIndex(index, count) {
  return index < 0 ? 0 : index >= count ? count - 1 : index;
}

/** 序列在 i 处的切线：中心差分，端点退化为单侧差分的一半 */
function tangentAt(values, index) {
  const prev = values[clampIndex(index - 1, values.length)];
  const next = values[clampIndex(index + 1, values.length)];
  return (next - prev) * 0.5;
}

/** 三次 Hermite 插值（t ∈ [0, 1]） */
function hermiteValue(p0, m0, p1, m1, t) {
  const t2 = t * t;
  const t3 = t2 * t;
  return (
    (2 * t3 - 3 * t2 + 1) * p0 +
    (t3 - 2 * t2 + t) * m0 +
    (-2 * t3 + 3 * t2) * p1 +
    (t3 - t2) * m1
  );
}

/**
 * 把视角列表预处理成一条平滑曲线：
 * 经度 / 纬度 / 高度与 heading/pitch/roll 都按 Catmull-Rom（中心差分切线 +
 * Hermite）插值，相邻航段在途经点处位置与速度都连续，镜头不会在视角上
 * 「一顿一顿」。
 *
 * 位置按经纬高插值而不是直接插值世界坐标：两点相距较远时，世界坐标的直线
 * 会切到椭球面以下，沿经纬高走则始终在椭球上方，不会钻地。
 */
function createCameraPath(viewpoints) {
  const longitudes = [];
  const latitudes = [];
  const heights = [];
  const headings = [];
  const pitches = [];
  const rolls = [];

  viewpoints.forEach((vp, i) => {
    const longitude = Cesium.Math.toRadians(vp.position.longitude);
    const heading = Cesium.Math.toRadians(vp.orientation?.heading ?? 0);

    // 经度 / heading 跨 0°、360° 时去掉回绕，避免插值时绕圈
    longitudes.push(
      i === 0 ? longitude : unwrapAngle(longitude, longitudes[i - 1]),
    );
    headings.push(i === 0 ? heading : unwrapAngle(heading, headings[i - 1]));

    latitudes.push(Cesium.Math.toRadians(vp.position.latitude));
    heights.push(vp.position.height);
    pitches.push(Cesium.Math.toRadians(vp.orientation?.pitch ?? 0));
    rolls.push(Cesium.Math.toRadians(vp.orientation?.roll ?? 0));
  });

  return {
    longitudes,
    longitudeTangents: longitudes.map((_, i) => tangentAt(longitudes, i)),
    latitudes,
    latitudeTangents: latitudes.map((_, i) => tangentAt(latitudes, i)),
    heights,
    heightTangents: heights.map((_, i) => tangentAt(heights, i)),
    headings,
    headingTangents: headings.map((_, i) => tangentAt(headings, i)),
    pitches,
    pitchTangents: pitches.map((_, i) => tangentAt(pitches, i)),
    rolls,
    rollTangents: rolls.map((_, i) => tangentAt(rolls, i)),
  };
}

/**
 * 按进度取相机位姿并写入相机
 * @param {object} camera - viewer.camera
 * @param {object} path - createCameraPath 的返回值
 * @param {number} progress - 连续进度，整数为视角下标（0 ~ 视角数 - 1）
 */
function applyCameraPose(camera, path, progress) {
  const legCount = path.longitudes.length - 1;
  const leg = Math.min(Math.max(Math.floor(progress), 0), legCount - 1);
  const t = progress - leg;
  const next = leg + 1;

  const at = (values, tangents) =>
    hermiteValue(values[leg], tangents[leg], values[next], tangents[next], t);

  Cesium.Cartesian3.fromRadians(
    at(path.longitudes, path.longitudeTangents),
    at(path.latitudes, path.latitudeTangents),
    at(path.heights, path.heightTangents),
    Cesium.Ellipsoid.WGS84,
    scratchPosition,
  );

  camera.setView({
    destination: scratchPosition,
    orientation: {
      heading: at(path.headings, path.headingTangents),
      pitch: at(path.pitches, path.pitchTangents),
      roll: at(path.rolls, path.rollTangents),
    },
  });
}

/** 相机是否已经停在某个视角上（位置 0.5m、角度 0.5° 以内视为同一个视角） */
function isAtViewpoint(camera, viewpoint) {
  const target = toCartesian3(viewpoint.position);
  if (Cesium.Cartesian3.distance(camera.positionWC, target) > 0.5) return false;

  const angleDiff = (current, target) => {
    let diff = current - target;
    while (diff > Math.PI) diff -= TWO_PI;
    while (diff < -Math.PI) diff += TWO_PI;
    return Math.abs(diff);
  };
  const tolerance = Cesium.Math.toRadians(0.5);
  return (
    angleDiff(
      camera.heading,
      Cesium.Math.toRadians(viewpoint.orientation?.heading ?? 0),
    ) < tolerance &&
    angleDiff(
      camera.pitch,
      Cesium.Math.toRadians(viewpoint.orientation?.pitch ?? 0),
    ) < tolerance &&
    angleDiff(
      camera.roll,
      Cesium.Math.toRadians(viewpoint.orientation?.roll ?? 0),
    ) < tolerance
  );
}

/**
 * 飞行到指定视角
 * @param {object} viewer - Cesium.Viewer 实例
 * @param {{position: {longitude: number, latitude: number, height: number}, orientation: {heading: number, pitch: number, roll: number}}} viewpoint
 * @param {object} [options]
 * @param {number} [options.duration=3.0] - 飞行时长（秒）
 * @param {Cesium.EasingFunction} [options.easingFunction] - 缓动曲线，默认 LINEAR_NONE（匀速线性移动）
 * @param {Function} [options.onComplete] - 飞行完成回调
 */
export function flyToViewpoint(viewer, viewpoint, options = {}) {
  const {
    duration = 3.0,
    easingFunction = Cesium.EasingFunction.LINEAR_NONE,
    onComplete,
  } = options;

  viewer.camera.flyTo({
    destination: Cesium.Cartesian3.fromDegrees(
      viewpoint.position.longitude,
      viewpoint.position.latitude,
      viewpoint.position.height,
    ),
    orientation: {
      heading: Cesium.Math.toRadians(viewpoint.orientation.heading),
      pitch: Cesium.Math.toRadians(viewpoint.orientation.pitch),
      roll: Cesium.Math.toRadians(viewpoint.orientation.roll),
    },
    duration,
    easingFunction,
    complete: onComplete,
  });
}

/**
 * 串行漫游播放：连续飞过所有视角，途中不停顿
 *
 * 整个路线作为一条平滑曲线一次播完：位置与姿态按 Catmull-Rom 插值，
 * 途经每个视角时只是「经过」，不会停下来（旧实现到位后要等 `dwell` 毫秒
 * 再飞下一段，看起来一顿一顿的）。
 *
 * 相机不在第一个视角上时，先用一次飞行把镜头带到起点，再开始连续飞行。
 * 用户按下鼠标 / 滚轮即视为接管相机，漫游自动结束（并触发 onFinish）。
 *
 * @param {object} viewer - Cesium.Viewer 实例
 * @param {Array<{position, orientation}>} viewpoints - 视角列表
 * @param {object} [options]
 * @param {number} [options.duration=5.0] - 相邻两个视角之间的飞行时长（秒），
 *   整条路线的总时长 = (视角数 - 1) × duration
 * @param {Function} [options.onFinish] - 全部播放完成 / 被停止 / 被用户接管时回调
 * @returns {{ stop: Function }} 返回 { stop } 用于中断漫游
 */
export function playRoaming(viewer, viewpoints, options = {}) {
  const { duration = 5.0, onFinish } = options;
  const noop = { stop() {} };

  if (
    !viewer ||
    viewer.isDestroyed() ||
    !Array.isArray(viewpoints) ||
    viewpoints.length === 0
  ) {
    onFinish?.();
    return noop;
  }

  // 先清掉可能在途的飞行（例如上一次漫游 / 返回默认视角），由本次漫游接管相机
  viewer.camera.cancelFlight();

  const camera = viewer.camera;
  const canvas = viewer.canvas;
  const isAlive = () => !viewer.isDestroyed();

  let playing = true;
  let removePreRender = null;
  let removeInteraction = null;

  const cleanup = () => {
    removePreRender?.();
    removePreRender = null;
    removeInteraction?.();
    removeInteraction = null;
  };

  const finish = () => {
    if (!playing) return;
    playing = false;
    cleanup();
    onFinish?.();
  };

  const stop = () => {
    if (!playing) return;
    if (isAlive()) camera.cancelFlight();
    finish();
  };

  // 鼠标按下 / 滚轮 = 用户想自己控制相机，直接结束漫游，避免每帧都被复位
  const handleUserInteraction = () => stop();

  const INTERACTION_EVENTS = ["pointerdown", "wheel"];
  const listenInteraction = () => {
    if (!canvas?.addEventListener) return;
    INTERACTION_EVENTS.forEach((type) =>
      canvas.addEventListener(type, handleUserInteraction, { passive: true }),
    );
    removeInteraction = () => {
      if (!canvas?.removeEventListener) return;
      INTERACTION_EVENTS.forEach((type) =>
        canvas.removeEventListener(type, handleUserInteraction),
      );
    };
  };

  listenInteraction();

  // 只有一个视角：直接飞过去，没有后续航段
  if (viewpoints.length === 1) {
    flyToViewpoint(viewer, viewpoints[0], { duration, onComplete: finish });
    return { stop };
  }

  const path = createCameraPath(viewpoints);
  const legCount = viewpoints.length - 1;
  const msPerLeg = Math.max(100, duration * 1000);

  // 连续飞行：按整条路线的时间进度逐帧写相机，航段之间不插任何停留
  const startContinuousFlight = () => {
    if (!playing) return;

    const startTime = nowMs();
    const tick = () => {
      if (!playing) return;
      if (!isAlive()) {
        finish();
        return;
      }

      // 别处又起了一次飞行（「回到默认视角」、列表行定位等）：把镜头让给它，
      // 这里不能 cancelFlight，否则会把对方的飞行一起取消。
      // Cesium 没有公开的「飞行中」判断，flyTo / flyToBoundingSphere 都会挂 _currentFlight。
      if (camera._currentFlight) {
        finish();
        return;
      }

      const progress = Math.min((nowMs() - startTime) / msPerLeg, legCount);
      applyCameraPose(camera, path, progress);
      if (progress >= legCount) finish();
    };

    viewer.scene.preRender.addEventListener(tick);
    removePreRender = () => viewer.scene.preRender.removeEventListener(tick);
  };

  // 相机不在起点时先飞过去（沿用原来的单次飞行），到位后立刻开始连续飞行
  if (isAtViewpoint(camera, viewpoints[0])) {
    startContinuousFlight();
  } else {
    flyToViewpoint(viewer, viewpoints[0], {
      duration,
      onComplete: startContinuousFlight,
    });
  }

  return { stop };
}

/**
 * 将视角列表序列化为 JSON 字符串
 * @param {Array} viewpoints - 视角列表
 * @returns {string}
 */
export function viewpointsToJSON(viewpoints) {
  return JSON.stringify(viewpoints, null, 2);
}

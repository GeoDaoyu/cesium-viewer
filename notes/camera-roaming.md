# 相机漫游与视角插值

## 单次飞行

`camera.flyTo()` 适合从一个视角到另一个视角：

```js
viewer.camera.flyTo({
  destination: Cesium.Cartesian3.fromDegrees(lon, lat, height),
  orientation: {
    heading: Cesium.Math.toRadians(30),
    pitch: Cesium.Math.toRadians(-45),
    roll: 0,
  },
  duration: 2,
});
```

`setView()` 是瞬移，没有动画；`flyTo()` 有动画和缓动。连续调用 `flyTo()` 会互相打断，
需要在 `complete` 回调里串起来，或者自己接管相机。

## 连续漫游：不要逐段 flyTo

逐段 `flyTo` 的观感是「到点 → 停一下 → 再飞」，镜头一顿一顿。更好的做法是把整条
路线预处理成一条曲线，每帧直接写相机：

1. 把每个视角的经纬高、heading / pitch / roll 转成弧度；
2. 经度 / heading 做角度展开（unwrap 到参考角 ±180° 内），避免在 0°/360° 处绕圈；
3. 每个分量用 Catmull-Rom（中心差分切线 + Hermite）插值，途经点处位置与速度连续；
4. 按总进度取位姿，每帧在 `scene.preRender` 里 `camera.setView()`。

```js
function tick() {
  const progress = Math.min(
    (performance.now() - startTime) / msPerLeg,
    legCount,
  );
  applyCameraPose(camera, path, progress);
  if (progress >= legCount) finish();
}
viewer.scene.preRender.addEventListener(tick);
```

## 位置插值用经纬高，不要直接插世界坐标

两个视角相距较远时，世界坐标（ECEF）的直线会从椭球面以下穿过，相机可能「钻地」。
按经度 / 纬度 / 高度插值，再 `Cartesian3.fromDegrees()` 转世界坐标，轨迹始终在椭球上方。

## 用户接管

漫游期间监听 canvas 的 `pointerdown` / `wheel`，用户一操作就停止漫游并把相机交还，
否则每帧 `setView()` 会和用户操作打架。

同时要判断相机是否已被别的逻辑接管（例如「回到默认视角」）：

```js
if (camera._currentFlight) {
  finish(); // 让出相机，不要 cancelFlight()，否则会把对方的飞行一起取消
  return;
}
```

`_currentFlight` 是 Cesium 内部字段，没有公开 API；用它做「是否有飞行在途」的判断
时，要接受版本升级可能失效的风险。

## 多视角合并定位

一次勾选多个模型 / 图层时，不要每个都飞一次。等全部加载完，取合并包围球只飞一次：

```js
const merged = Cesium.BoundingSphere.fromBoundingSpheres(spheres);
viewer.camera.flyToBoundingSphere(merged, { offset });
```

## 本仓库实现

- `src/utils/camera/roaming.js`：`playRoaming()` / `flyToViewpoint()`；
- `src/components/CameraTour/index.jsx`：预设视角与播放按钮；
- `src/utils/camera/homeView.js`：默认视角。

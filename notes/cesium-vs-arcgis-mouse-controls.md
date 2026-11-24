# Cesium vs ArcGIS — 鼠标操作差异

## 默认键位对比

| 操作            | ArcGIS SceneView (3D) | Cesium（默认） |
| --------------- | --------------------- | -------------- |
| 左键拖拽        | **平移**              | **旋转**       |
| 右键拖拽        | **旋转 + 倾斜**       | **缩放**       |
| 中键拖拽        | —                     | **倾斜**       |
| 滚轮            | 缩放                  | 缩放           |
| Ctrl + 左键拖拽 | —                     | 倾斜           |
| Ctrl + 右键拖拽 | —                     | 倾斜           |

核心差异：ArcGIS 用户习惯**右键旋转**，Cesium 默认**右键缩放**，直接上手很别扭。

## 配置方式

通过 `ScreenSpaceCameraController` 的三个属性控制：

```js
const controller = viewer.scene.screenSpaceCameraController;
const { CameraEventType, KeyboardEventModifier } = Cesium;

// 旋转（水平拖拽 → 改变 heading）
controller.rotateEventTypes = [
  CameraEventType.LEFT_DRAG,
  CameraEventType.RIGHT_DRAG, // 右键也参与旋转
];

// 倾斜（垂直拖拽 → 改变 pitch）
controller.tiltEventTypes = [
  CameraEventType.MIDDLE_DRAG,
  CameraEventType.RIGHT_DRAG,
  CameraEventType.PINCH,
  {
    eventType: CameraEventType.LEFT_DRAG,
    modifier: KeyboardEventModifier.CTRL,
  },
  {
    eventType: CameraEventType.RIGHT_DRAG,
    modifier: KeyboardEventModifier.CTRL,
  },
];

// 缩放：去掉右键，只留滚轮和双指
controller.zoomEventTypes = [CameraEventType.WHEEL, CameraEventType.PINCH];
```

## 为什么左键不能设成「平移」

ArcGIS 的左键平移在 Cesium 里没有直接对应的 `translateEventTypes` 配置项。
Cesium 的平移要通过 `camera.moveLeft()` / `camera.moveUp()` 自行实现，属于较深的定制。

实际项目里的折衷：**左右键都能旋转 + 倾斜**，左键保留 Cesium 默认行为，
右键改成 ArcGIS 风格的旋转 + 倾斜，先消除最大的体感差异。

## 相关 API

- `Cesium.ScreenSpaceCameraController`
- `CameraEventType.LEFT_DRAG` / `RIGHT_DRAG` / `MIDDLE_DRAG` / `WHEEL` / `PINCH`
- `KeyboardEventModifier.CTRL` / `SHIFT` / `ALT`
- 每个 event type 条目可以是枚举值，也可以是 `{ eventType, modifier }` 对象

# Cesium 快速上手（写给 ArcGIS 开发者）

## 一、核心哲学差异

| 维度     | ArcGIS JS (4.x)                | CesiumJS                                             |
| -------- | ------------------------------ | ---------------------------------------------------- |
| 底层     | WebGL 封装，贴近 GIS 行业规范  | 直接写 WebGL / GLSL，严格 WGS84 椭球，数学计算重     |
| 坐标系   | 视图是屏幕，空间参考可动态投影 | 唯一坐标 `Cartesian3`（ECEF），经纬度只用于输入      |
| 时间     | 弱时间轴                       | 强时间轴 `Clock`，所有动态属性可随 `JulianDate` 变化 |
| 数据加载 | 懒加载、按需渲染               | 预加载 Primitive，进入内存后基本不变                 |
| 文档     | 官方 API 文档丰富              | 偏底层，最佳实践多在 Sandcastle 和 GitHub Issue      |

一句话：Cesium 更像游戏引擎，一切皆 Primitive，世界是椭球体，时间是连续流。

## 二、概念对照

| ArcGIS                       | Cesium                               | 说明                                          |
| ---------------------------- | ------------------------------------ | --------------------------------------------- |
| `Map`                        | `Viewer`                             | `new Cesium.Viewer(div)` 自带底图、时钟、控件 |
| `MapView` / `SceneView`      | `Scene`（`viewer.scene`）            | 相机、光照、全局属性                          |
| `GraphicsLayer`              | `DataSource`（Entity）               | Entity 是高层封装，适合快速开发               |
| `FeatureLayer` / `TileLayer` | `ImageryLayer` / `TerrainProvider`   | 影像、地形是独立 Provider                     |
| `SceneLayer` / 3D Tiles      | `Cesium3DTileset`                    | Cesium 是 3D Tiles 标准制定者                 |
| `Renderer` / 符号化          | `Primitive`（Geometry + Appearance） | 无符号化概念，直接定义顶点与着色器            |
| `watch` / `reactiveUtils`    | `viewer.clock.onTick`                | 每帧变化在 tick 里处理                        |

## 三、需要「忘掉」的 ArcGIS 习惯

### 1. `MapView.goTo()` 的平滑感

Cesium 的 `camera.flyTo()` 要传笛卡尔坐标或 `Rectangle`，并且连续调用会互相打断，
需要在 `complete` 回调里串联。

```js
viewer.camera.flyTo({
  destination: Cesium.Cartesian3.fromDegrees(110, 30, 5000),
  orientation: {
    heading: Cesium.Math.toRadians(0),
    pitch: Cesium.Math.toRadians(-45),
  },
  complete: () => console.log("飞行完成"),
});
```

### 2. `Graphic.attributes` 直接查属性

Cesium 的 `entity.properties` 是 `PropertyBag`，要按时间求值：

```js
const name = entity.properties?.getValue(viewer.clock.currentTime)?.name;
```

定义时直接挂在 Entity 顶层的属性（`entity.name`）可以直接读。

### 3. `onMouseMove` 这么简单的事件

Cesium 用 `ScreenSpaceEventHandler` 区分左右键，拾取需要 `scene.pick()` /
`drillPick()`，开销比 DOM 事件大：

```js
const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
handler.setInputAction((movement) => {
  const picked = viewer.scene.pick(movement.endPosition);
  if (Cesium.defined(picked)) {
    // picked.id 通常是 Entity
  }
}, Cesium.ScreenSpaceEventType.MOUSE_MOVE);
```

## 四、坐标系三件套

Cesium 内部只有 `Cartesian3`（ECEF，单位米）：

```js
// 1. 经纬度 → 世界坐标
const position = Cesium.Cartesian3.fromDegrees(lon, lat, height);

// 2. 世界坐标 → 经纬度
const cartographic = Cesium.Cartographic.fromCartesian(position);
const lon = Cesium.Math.toDegrees(cartographic.longitude);
const lat = Cesium.Math.toDegrees(cartographic.latitude);
const h = cartographic.height;

// 3. 距离
const distance = Cesium.Cartesian3.distance(p1, p2);
```

高度是**椭球高**，不是 EGM2008 大地水准面高。需要精确换算时接 Geoid 服务。

## 五、矩阵运算

ArcGIS 帮你算的，Cesium 要自己处理：

| 矩阵               | 用途                           |
| ------------------ | ------------------------------ |
| `ModelMatrix`      | 模型摆放（平移 / 旋转 / 缩放） |
| `ViewMatrix`       | 相机视角                       |
| `ProjectionMatrix` | 投影变换                       |

贴地 / 旋转模型的核心函数：

```js
const modelMatrix = Cesium.Transforms.eastNorthUpToFixedFrame(
  Cesium.Cartesian3.fromDegrees(110, 30, 0),
);
// 在这个矩阵上继续平移 / 旋转 / 缩放
```

## 六、Entity vs Primitive 选型

```
要素 < 100 个，需要点击 / 悬停？
  → Entity（高层封装，自带事件与属性）
要素 100–5000 个，静态展示？
  → Primitive + GeometryInstance（性能好）
要素 > 5000 个，动态更新？
  → 自定义 Primitive / 手动管理 VertexArray
加载倾斜摄影 / BIM？
  → Cesium3DTileset
```

Entity 是「自动挡轿车」：好开但费油；Primitive 是「手动挡赛车」：难驾驭但性能上限高。

## 七、Primitive 的本质

> Primitive = Geometry（几何体）+ Appearance（外观）+ ModelMatrix（变换矩阵）

它跳过 GIS 业务逻辑（坐标系转换、符号化、属性查询），直接把顶点数据交给 WebGL。

```js
const primitive = new Cesium.Primitive({
  geometryInstances: new Cesium.GeometryInstance({
    geometry: new Cesium.BoxGeometry({
      dimensions: new Cesium.Cartesian3(1000, 1000, 1000),
    }),
    modelMatrix: Cesium.Matrix4.multiplyByTranslation(
      Cesium.Transforms.eastNorthUpToFixedFrame(
        Cesium.Cartesian3.fromDegrees(110, 30),
      ),
      new Cesium.Cartesian3(0, 0, 500),
      new Cesium.Matrix4(),
    ),
  }),
  appearance: new Cesium.PerInstanceColorAppearance({
    flat: true,
    translucent: false,
  }),
});

viewer.scene.primitives.add(primitive);
```

内部行为：

1. 合并几何体：多个 `GeometryInstance` 共享 Appearance 时合并顶点缓冲，减少 Draw Call；
2. 生成 VAO：绑定顶点属性到着色器；
3. 计算包围盒：用于视锥体裁剪。

## 八、迁移建议

- 先把「坐标转换」「相机操作」「拾取」三件事写顺手，再谈业务；
- 能用 Entity 就用 Entity，性能不够再降级到 Primitive；
- 不要照搬 ArcGIS 的图层体系，Cesium 的影像是 Provider、矢量是 DataSource、模型是 Tileset；
- 时间相关的属性一律走 `Clock` / `CallbackProperty`，不要自己 `setInterval`；
- 多看看 Sandcastle 示例，比 API 文档更直观。

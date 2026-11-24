# 技术笔记

记录这个项目里几个不那么直观的 Cesium 实现点，以及从 ArcGIS 迁移时的概念对照。

## 1. 从 ArcGIS 到 Cesium

| ArcGIS (4.x)            | Cesium                         | 说明                                   |
| ----------------------- | ------------------------------ | -------------------------------------- |
| `SceneView` / `MapView` | `Cesium.Viewer`                | Viewer 自带相机、时钟、控件            |
| `MapImageLayer`         | `ImageryLayer`（WMTS / XYZ）   | 服务端出图的栅格图层                   |
| `FeatureLayer`          | `GeoJsonDataSource` / 自定义   | 前端矢量要素，没有等价的服务端要素图层 |
| `Graphic`               | `Entity`                       | Entity 是声明式属性，逐帧求值          |
| `SimpleRenderer`        | `entity.polygon.material` 等   | 样式直接挂在实体上                     |
| `Camera.goTo()`         | `camera.flyTo()` / `setView()` | `setView` 是瞬移，`flyTo` 有动画       |
| `view.spatialReference` | 固定 WGS84                     | 3D 场景只有 ECEF / WGS84，无动态投影   |
| `hitTest()`             | `scene.pick()` / `drillPick()` | 返回 Entity 或 3D Tiles 要素           |

Cesium 没有「动态投影」：影像服务由 provider 自动重投影到地理坐标，矢量数据必须
是 WGS84（GeoJSON 规范如此），3D Tiles 规范本身也是 WGS84。

## 2. 绘制顺序：为什么面填充要做成影像

Cesium 每帧的绘制顺序大致是：

```
地球（地形 + 影像） → 地面图元（clampToGround）→ 不透明 / 半透明矢量图元
```

也就是说，**矢量面永远压在所有影像图层之上**，改加载顺序没有用。如果业务上需要
「面填充垫在切片图层下面、边界和名称在上面」，只能拆成两层：

1. 填充：把面几何按瓦片范围画进 256×256 canvas，做成 `ImageryLayer`
   （`src/utils/layers/fillImagery.js`），用 `imageryLayers.add(layer, index)`
   插到指定位置；
2. 边界：把面环拆成 `LineString`，贴地画线（贴地面图元不支持描边，
   `polygon.outline` 会被忽略）；
3. 名称：`Entity.label`，永远压在影像与矢量之上。

本项目里 `geojsonTheme.js` 与 `queryLayer.js` 都用这套拆层方式。

## 3. WMTS 级号偏移

很多国产 WMTS 的 `TileMatrix` 从 1 或更大的级号开始，而 Cesium 的
`WebMapTileServiceImageryProvider` 从 0 级开始请求。不映射时表现为**地球一片空白、
控制台也没有报错**（服务端对越界级号返回 404 / 空瓦片）。

两种写法：

```js
// 方式一：级号偏移（服务级号 = Cesium 级号 + 1）
{ levelOffset: 1, maximumLevel: 18 }

// 方式二：直接给映射表
{ tileMatrixLabels: ["1", "2", "...", "19"] }
```

`src/utils/layers/wmts.js` 的 `buildTileMatrixLabels()` 会按
`maximumLevel + levelOffset` 生成映射表。

## 4. 3D Tiles 整体高度偏移

倾斜模型 / Mesh 的高程与地形常有系统性偏差，贴地后底部会陷进去。直接改
`tileset.json` 里的 `transform` 不方便，可以在加载完成后左乘一个平移矩阵：

```js
const enu = Cesium.Transforms.eastNorthUpToFixedFrame(
  tileset.boundingSphere.center,
);
const up = Cesium.Matrix4.getColumn(enu, 2, new Cesium.Cartesian4());
const offset = Cesium.Cartesian3.multiplyByScalar(
  Cesium.Cartesian3.fromCartesian4(up, new Cesium.Cartesian3()),
  heightOffset,
  new Cesium.Cartesian3(),
);
tileset.modelMatrix = Cesium.Matrix4.multiply(
  Cesium.Matrix4.fromTranslation(offset),
  tileset.modelMatrix ?? Cesium.Matrix4.IDENTITY,
  new Cesium.Matrix4(),
);
```

`eastNorthUpToFixedFrame` 的 z 轴就是该点的椭球法线，所以偏移方向是「当地的上」，
不是 ECEF 的 z 轴。偏移量在配置 `tilesetHeightOffset` 里，改完刷新页面即可。

## 5. 点图查询

地图服务的要素查询接口通常支持 `spatialFilter`（WKT 空间过滤）。点图查询的做法：

1. 把屏幕点击点转成经纬度（优先 `globe.pick()`，地形上取的是地形表面点）；
2. 以该点为中心构造一个很小的闭合矩形（容差 `0.0001°`），避免 `INTERSECTS` 落空；
3. 逐层请求，**必须带 `spatialFilter`**：不传就是全表查询，大图层几十 MB；
4. 命中的要素用返回的 `shape`（WKT）画一份红色覆盖层，并打开属性弹窗。

叠放顺序很重要：数组按「上层 → 下层」排，命中即停，上层小范围图层没盖住点击点时
还能落到下面的全图图层。单层请求失败只记日志、继续查下一层。

高亮覆盖层必须标记为**不参与拾取**（`pickable: false` + `scene.drillPick()`），
否则下一次点击会命中高亮层自己，查不到下面的业务图层。

## 6. 相机漫游插值

如果逐段 `flyTo`，镜头会在每个视角停一下再走，观感很顿。这里的做法是把整条路线
预处理成一条曲线：

- 位置按**经纬高**插值（不是世界坐标直线，否则远距离会切到椭球面以下）；
- 经度 / heading 先做角度展开（unwrap），避免在 0°/360° 处绕圈；
- 每个分量用 Catmull-Rom（中心差分切线 + Hermite）插值，途经点处位置与速度连续；
- 每帧在 `scene.preRender` 里直接 `camera.setView()`，不产生 Cesium 的 flight 状态。

用户按下鼠标 / 滚轮时立即停止漫游，把相机交还给用户。实现见
`src/utils/camera/roaming.js`。

## 7. Viewer 生命周期与路由切换

Cesium Viewer 是页面级组件，切路由会销毁重建。图层实例、相机监听、事件 handler
都绑定在旧 viewer 上，必须在新 viewer 就绪后重新加载；异步加载回调里要判断
`viewer.isDestroyed()` 以及 `useCesiumStore.getState().viewer === viewer`，
否则会把图层挂到已经销毁的实例上，或者把旧结果写进新页面。

本项目的 `ThemeSwitcher` 用 `layersRef`（value → 图层句柄 + 所属 viewer）做 diff：
viewer 一变，旧图层全部摘掉、按当前勾选重新加载。

## 8. 其他坑

- **`CESIUM_BASE_URL` 必须在 Cesium JS 加载前设置**。`public/cesiumInit.js` 通过
  `headScripts` 注入，早于应用 bundle。不要用打包器的 DefinePlugin 替换，引号会
  泄漏到 URL 里（`%22`）。
- **antd 的 `style` 字段**：配置条目里的 `style` 是 WMTS 样式名，如果原样传给
  `TreeSelect` / `Select`，antd 会把它当 CSS 对象展开成 `{0:"d",1:"e",...}`，
  React 写 `style["0"]` 时整页白屏。传给 antd 前只保留 `title / value / children`。
- **`camera.changed` 是下一帧触发**：`setView()` 后想立刻拿相机状态，要手动调一次
  同步函数。
- **WMTS 默认 30% 透明**：切片服务通常不透明，直接叠会盖住底图。`createWMTSLayer`
  默认 `alpha = 0.7`，底图显式传 `alpha: 1`。

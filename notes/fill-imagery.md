# 面填充做成影像层

## 问题

Cesium 每帧的绘制顺序大致是：

```
地球（地形 + 影像） → 地面图元 → 不透明 / 半透明矢量图元
```

也就是说，**矢量面永远压在所有影像图层之上**，改加载顺序没有用。
如果业务上要求「面填充垫在切片图层下面，边界和名称在上面」，只靠一个
`GeoJsonDataSource` 做不到。

## 拆成两层

### 1. 填充 = 客户端栅格化的 ImageryLayer

把面几何按瓦片范围画进 256×256 的 canvas，生成自定义 `ImageryProvider`，
再作为 `ImageryLayer` 插到 `imageryLayers` 的指定位置：

```js
viewer.imageryLayers.add(fillLayer, 2);
// 0 = 底图，1 = 可选的叠加影像，2 = 业务切片之下
```

`src/utils/layers/fillImagery.js` 的实现要点：

- 用 `GeographicTilingScheme` 按经纬度切 256px 瓦片；
- `requestImage(x, y, level)` 里把多边形路径按该瓦片的经纬度范围映射到 canvas，
  填色后返回 canvas；
- 只支持 `Polygon` / `MultiPolygon`；
- 每级瓦片单独绘制，任意缩放级别边缘都清晰（不像单张大图放大后糊成一片）。

### 2. 边界 + 名称 = 矢量

- 边界：贴地面图元不支持描边，把每个面环拆成 `LineString` 单独画
  （`src/utils/geojsonBoundary.js`）；
- 名称：`Entity.label`，是实体，永远压在影像与矢量之上；
- 面要素本身可以隐藏（`polygon.show = false`），只保留边界和 label；
- 需要点击时，面要素保留但材质设为 `Color.TRANSPARENT`，透明材质仍会进入 pick buffer。

## 适用场景

- 行政边界 / 园区 / 规划范围这类「大面积参考底图」，要垫在业务切片下面；
- 面数据不大（几十到几百个要素），客户端栅格化成本可接受；
- 不希望依赖服务端配色 / 出图。

## 局限

- 只支持面，点 / 线仍用矢量；
- 不支持纹理填充、渐变、描边样式（描边要单独画线）；
- 面特别多（几万个）时 canvas 绘制会变慢，应该让服务端出图；
- 需要自己处理瓦片缓存与 `destroy()`，避免切图层后残留。

## 和 z-fighting 的关系

填充是影像层，不参与矢量面的深度测试；边界 / 名称是矢量，仍要遵守
`clampToGround + zIndex` 的规则（见 `polygon-z-fighting.md`）。

## 本仓库实现

- `src/utils/layers/fillImagery.js`：栅格化填充 provider；
- `src/utils/layers/geojsonTheme.js`：静态 GeoJSON 的填充 + 边界 + 标注；
- `src/utils/layers/queryLayer.js`：查询服务取 WKT 后的同样拆层。

# 面图层重叠闪烁（z-fighting）

## 现象

多个面图层同时加载（例如省 / 市 / 县 / 乡镇边界），面在空间上重叠。所有 polygon 默认
渲染在椭球表面的同一高度，WebGL 深度缓冲区精度不足以区分共面多边形，拖动相机时
重叠区域会不断闪烁。

## 原因

`GeoJsonDataSource` 默认 `clampToGround: false`，面位于椭球面 z=0；层与层之间没有
任何深度差。远距离观察时，1–2 米的高度差在 24-bit 深度缓冲里几乎不可分辨。

## 方案对比

### height 高度偏移（不可靠）

```js
entity.polygon.height = 2; // 想让村比镇高 2 米
```

深度精度随相机距离衰减，几百米到几公里的观察距离下仍然闪烁。

### clampToGround + zIndex（推荐）

```js
await Cesium.GeoJsonDataSource.load(url, { clampToGround: true });

// 数值越大越靠上
entity.polygon.zIndex = 2;
```

贴地面图元走 Cesium 的 **GroundPrimitive** 通道，用显式绘制顺序而不是深度测试，
无论相机多远都不会闪烁。

| 方案                   | 原理         | 远距离 | 轮廓线     |
| ---------------------- | ------------ | ------ | ---------- |
| height 偏移            | 深度缓冲     | 仍闪烁 | 支持       |
| clampToGround + zIndex | 显式绘制顺序 | 不闪烁 | **不支持** |

代价：贴地面图元不支持 `outline`，需要描边时把每个面环拆成 `LineString` 单独画
（`src/utils/geojsonBoundary.js`）。

## 渲染通道与拾取顺序

Cesium 每帧按固定通道顺序绘制，不是「谁 zIndex 大谁在上面」：

```
1. 地球（地形 + 影像底图）
2. 不透明 3D Tiles / Primitives
3. 地面图元通道（GroundPrimitives，clampToGround: true）
4. 半透明通道（非贴地 + alpha < 1）
```

**通道 4 永远画在通道 3 之上，zIndex 只在同一通道内有效。**

`scene.pick()` 返回绘制在最上层的对象，所以拾取优先级也是：
通道 4 → 通道 3 → 通道 2 → 通道 1。同一通道内 `zIndex` 越大越先被拾取。

### 典型隐性 bug

如果参考底图是「非贴地 + 半透明」（通道 4），业务面是「贴地」（通道 3），
底图会永远盖在业务面上面：

- 视觉上只是颜色变深，不容易发现；
- 拾取时 `scene.pick()` 永远命中底图，下面的业务面收不到点击。

修复：把参考底图也改成 `clampToGround: true`，按 zIndex 垫在业务面下面
（如 `zIndex = -1`），所有面统一进通道 3。

## 独立高亮层与拾取穿透

点击高亮通常用独立的 `CustomDataSource` 画红色面，不改原业务要素。高亮层位于业务面
上方，如果参与拾取，下一次点击会命中高亮层自己。

做法：

1. 高亮数据源标记为**不参与拾取**（`pickable: false`）；
2. 统一用 `scene.drillPick()`，跳过高亮数据源，取第一个普通实体；
3. 封装成 `pickEntity(viewer, position)`，点击 / 悬停 / 点图查询都走它。

```js
const entity = viewer.scene
  .drillPick(position, 10)
  .find(
    (picked) =>
      Cesium.defined(picked) &&
      picked.id instanceof Cesium.Entity &&
      !isHighlightEntity(picked.id),
  )?.id;
```

## 规则总结

|          | 同通道内          | 跨通道                                    |
| -------- | ----------------- | ----------------------------------------- |
| 视觉顺序 | `zIndex` 大在上   | 通道号大在上（zIndex 无效）               |
| 拾取顺序 | `zIndex` 大先命中 | 通道号大先命中                            |
| 想调层级 | 改 `zIndex`       | 先改 `clampToGround` / 透明度，进同一通道 |

## 本仓库实现

- `src/utils/layers/geojson.js`：`clampToGround` 与 `zIndex`；
- `src/utils/geojsonBoundary.js`：面环 → 贴地线；
- `src/utils/pick.js`：`pickEntity()` / `markDataSourceNonPickable()`；
- `src/utils/highlights.js`：一次性高亮的固定 name 与清理。

# 3D Tiles

## 加载

```js
const tileset = await Cesium.Cesium3DTileset.fromUrl(
  "https://example.com/tiles/tileset.json",
  {
    maximumScreenSpaceError: 16,
    maximumMemoryUsage: 512,
  },
);
viewer.scene.primitives.add(tileset);
```

- `maximumScreenSpaceError` 越小越清晰、越吃性能；
- `maximumMemoryUsage` 限制缓存（MB），大场景要调；
- `Cesium.Ion` 资产可以用 `ionAssetId` 代替 URL；
- 加载是异步的，`await` 之后要判断 `viewer.isDestroyed()`，避免挂到已销毁的 Viewer 上。

## 整体高度偏移

倾斜模型 / Mesh 与 DEM 常有系统性高程差，贴地后底部会陷进去。直接改 `tileset.json`
里的 `transform` 不方便，可以在加载完成后左乘一个平移矩阵：

```js
function applyHeightOffset(tileset, heightOffset) {
  if (!heightOffset) return;

  const center = tileset.boundingSphere?.center;
  if (!center) return;

  const enu = Cesium.Transforms.eastNorthUpToFixedFrame(center);
  const up = Cesium.Matrix4.getColumn(enu, 2, new Cesium.Cartesian4());
  const offset = Cesium.Cartesian3.multiplyByScalar(
    Cesium.Cartesian3.fromCartesian4(up, new Cesium.Cartesian3()),
    heightOffset,
    new Cesium.Cartesian3(),
  );

  const lift = Cesium.Matrix4.fromTranslation(offset, new Cesium.Matrix4());
  tileset.modelMatrix = Cesium.Matrix4.multiply(
    lift,
    tileset.modelMatrix ?? Cesium.Matrix4.IDENTITY,
    new Cesium.Matrix4(),
  );
}
```

关键点：

- `eastNorthUpToFixedFrame` 的 z 轴是**当地椭球法线**，所以是「当地的上」，不是 ECEF 的 z 轴；
- 左乘 `modelMatrix`：平移发生在世界坐标里，不受模型自身旋转影响；
- 偏移量放到运行时配置里，现场改完刷新即可，不用重新打包；
- 个别模型不需要抬升时传 `heightOffset: 0`。

## 飞定位

```js
viewer.camera.flyToBoundingSphere(tileset.boundingSphere, {
  offset: new Cesium.HeadingPitchRange(
    Cesium.Math.toRadians(0),
    Cesium.Math.toRadians(-45),
    tileset.boundingSphere.radius * 1.5,
  ),
});
```

倾斜模型用 -45° 俯仰角比正俯视更直观。多个模型一起定位时，可以合并包围球只飞一次：

```js
const merged = Cesium.BoundingSphere.fromBoundingSpheres(spheres);
```

## 样式

- `tileset.style = new Cesium.Cesium3DTileStyle({ color: "..." })` 可以按属性着色；
- 样式在瓦片加载后生效，不需要重建 tileset；
- 拾取瓦片要素用 `scene.pick()`，返回 `Cesium3DTileFeature`，不是 `Entity`。

## 常见坑

- **模型浮空 / 下陷**：先检查高程基准，再用 `modelMatrix` 平移，不要直接改 `tileset.json`；
- **点模型弹出了下面图层的属性**：点图查询要先 `pickModelFeature()` 排除瓦片要素；
- **加载完就切路由**：`await` 后要检查 `viewer.isDestroyed()`；
- **多个 Viewer 共用一个 tileset**：Cesium 的 Primitive 不能跨 Viewer，必须各建一份；
- **包围球为空**：加载失败时 `boundingSphere` 可能不存在，飞定位前先判断。

## 本仓库实现

- `src/utils/layers/threeDTiles.js`：加载、高度偏移、样式；
- `public/config/app.js` 的 `tilesetHeightOffset`：全局抬升高度。

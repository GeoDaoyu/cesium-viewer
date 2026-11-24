# 三维地形

## 标准接入

Cesium 支持 quantized-mesh（推荐）与 heightmap 两种地形格式，服务根目录下需要有
`layer.json`。用 `CesiumTerrainProvider.fromUrl()` 创建：

```js
const terrainProvider = await Cesium.CesiumTerrainProvider.fromUrl(
  "https://example.com/terrain/",
  {
    requestVertexNormals: true,
    requestWaterMask: false,
  },
);

viewer.terrainProvider = terrainProvider;
```

`viewer.terrainProvider` 是**单例**：地球只有一层地形。多个地形服务要么在服务端合成，
要么按相机范围自行切换 provider。

## 异步挂载与失败兜底

地形加载是异步的，Viewer 可以先建好、再挂地形：

```js
let cancelled = false;

createTerrainProvider()
  .then((provider) => {
    if (!provider || cancelled || viewer.isDestroyed()) return;
    viewer.terrainProvider = provider;
  })
  .catch((error) => {
    // 地形不通不应该影响底图和业务图层，地球保持光滑椭球
    console.warn("[terrain] 地形加载失败，回退光滑椭球：", error);
  });
```

注意：

- 失败只告警，不要让整个页面挂掉；
- 组件卸载时把 `cancelled` 置位，避免异步回来往已销毁的 Viewer 上写；
- 两个 Viewer（例如左右对比）要各建一份 provider，SDK / provider 实例不能跨 Viewer 共用。

## 非标准地形格式

有些厂商的地形服务不是 quantized-mesh：没有 `layer.json`，瓦片是自定义压缩格式，
`CesiumTerrainProvider` 读不了。这时只有两条路：

1. **服务端转换**：把瓦片转成 quantized-mesh 再发布（最稳，前端无额外依赖）；
2. **自定义 `TerrainProvider`**：实现 `requestTileGeometry()` 等方法，自己解码瓦片，
   返回 `HeightmapTerrainData` 或 `QuantizedMeshTerrainData`。

自定义 Provider 的要点：

- 从服务元数据里拿 `startLevel` / `endLevel` / 分辨率 / 无效值；
- 解码后的高程网格要转成米，注意量化参数不要自己猜；
- 级号从 1 开始时，Cesium 的 0 级要映射到服务的第 1 级；
- 瓦片不存在 / 全为 nodata 时返回 `undefined`，Cesium 会按「无数据」处理；
- 自定义 Provider 只能服务一个 Viewer，多个 Viewer 要各建实例。

如果厂商提供了解码 SDK，把它当成黑盒：懒加载、注入前把 `window.Cesium` 指向打包进来的
Cesium 命名空间（SDK 往往直接读全局），升级时整文件替换，不要改混淆后的代码。

## 高度与模型贴合

- 影像、地形、3D Tiles 的高程基准可能不同：倾斜模型 / Mesh 与 DEM 常有系统性偏差，
  贴地后底部会陷进去，需要给 `tileset.modelMatrix` 加整体抬升（见 `3d-tiles.md`）；
- 实体用 `HeightReference.CLAMP_TO_GROUND` 时会自动贴地形；
- `screenSpaceCameraController` 会按地形做碰撞检测，相机不会穿到地下。

## 排查

1. `viewer.terrainProvider` 是否真的从 `EllipsoidTerrainProvider` 换成了目标 provider；
2. Network 里请求的是 `layer.json` 还是自定义元数据接口，返回结构对不对；
3. 瓦片级号是否从 1 开始、是否超出服务范围；
4. 是否被 CORS / 鉴权挡住（地形请求同样走浏览器）。

## 本仓库实现

- `src/utils/layers/terrain.js`：标准 `CesiumTerrainProvider` 封装；
- `public/config/app.js` 的 `terrain`：`url` 留空即不挂地形。

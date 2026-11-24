# 底图与 WMTS 参数

## 底图是什么

在 Cesium 里，底图就是 `viewer.imageryLayers` 的第 0 层（或构造 Viewer 时传的
`baseLayer`）。它和业务图层没有本质区别，都是 `ImageryLayer`；区别只是：
底图通常不透明、不参与拾取、永远垫在最下面。

本仓库支持两种底图：

```js
// XYZ / 瓦片模板
{
  type: "xyz",
  url: "https://example.com/tiles/{z}/{x}/{y}.png",
  maximumLevel: 19,
  credit: "© Example",
}

// OGC WMTS
{
  type: "wmts",
  url: "https://example.com/wmts",
  layer: "demo",
  style: "default",
  tileMatrixSetID: "EPSG:3857",
  format: "image/png",
  maximumLevel: 18,
}
```

`createBasemapLayer()` 在没有 `url` 时返回 `false`，Viewer 就不建底图。
**不要返回 `undefined`**：Cesium 会用默认的 Ion 全球影像兜底，导致「明明没配底图却
悄悄请求 Ion」或直接报 token 错误。

## WMTS 关键参数

| 参数                            | 说明                                                                         |
| ------------------------------- | ---------------------------------------------------------------------------- |
| `url`                           | KVP 端点或 RESTful 模板，模板里用 `{TileMatrix}` / `{TileRow}` / `{TileCol}` |
| `layer`                         | 图层名（Capabilities 里的 `<Layer><ows:Identifier>`）                        |
| `style`                         | 样式名，一般 `default`                                                       |
| `format`                        | `image/png` / `image/jpeg` / `image/jpgpng`                                  |
| `tileMatrixSetID`               | 矩阵集，如 `EPSG:3857` / `EPSG:4490` / `c`                                   |
| `tilingScheme`                  | `geographic`（经纬度）或 `mercator`，要和矩阵集一致                          |
| `minimumLevel` / `maximumLevel` | Cesium 侧级号范围                                                            |
| `levelOffset`                   | 服务级号 = Cesium 级号 + 该值                                                |
| `tileMatrixLabels`              | 直接指定每个 Cesium 级号对应的服务标签，优先级高于 `levelOffset`             |
| `rectangle`                     | `[西, 南, 东, 北]`，超出范围不请求瓦片                                       |
| `alpha`                         | 图层透明度，切片业务图层默认 0.7                                             |

## 级号偏移：最常见的「空白地球」

很多国产 WMTS 的 `TileMatrix` 从 1 或更大的级号开始，而 Cesium 从 0 级请求。
不映射时表现为**地球一片空白、控制台也没有报错**（服务端对越界级号返回 404 或空瓦片）。

```js
// 服务级号 = Cesium 级号 + 1
{ levelOffset: 1, maximumLevel: 18 }

// 或直接给映射表
{ tileMatrixLabels: ["1", "2", "3", "...", "19"] }
```

`src/utils/layers/wmts.js` 的 `buildTileMatrixLabels()` 会按
`maximumLevel + levelOffset` 生成映射表。

## 切片方案与范围

- 经纬度瓦片（EPSG:4490 / 4326）用 `GeographicTilingScheme`，
  第 L 级经度跨度为 `180 / 2^L` 度；
- Web Mercator（EPSG:3857）用 `WebMercatorTilingScheme`；
- 两者混用会整体偏移，且不一定报错，优先用 Capabilities 里的 `SupportedCRS` 判断。

配置写在 `public/config/*.js` 这种纯数据脚本里时，拿不到 Cesium 命名空间，
所以本项目允许写字符串 `"geographic"` / `"mercator"`，由
`resolveTilingScheme()` 在代码侧转成实例。

`rectangle` 用来限制请求范围：服务只覆盖某省 / 某市时，超出范围的瓦片通常 404，
不设范围会刷一屏失败请求。注意有些服务对境外 / 省外返回「200 的空白图」而不是 404，
这种情况靠 `rectangle` 也挡不住，属正常现象。

## KVP vs RESTful

- **KVP**：`?service=WMTS&request=GetTile&layer=...&tilematrixset=...&TileMatrix={TileMatrix}...`，
  Cesium 会保留 URL 里已有的参数（如 `tk`），再追加缺失的请求参数；
- **RESTful**：`/rest/{layer}/{style}/{TileMatrixSet}/{TileMatrix}/{TileRow}/{TileCol}`，
  模板里已经带了占位符，Cesium 直接替换。

只声明 KVP 的服务不要硬套 RESTful 路径；以 Capabilities 的 `ResourceURL` 为准。

## 透明度和叠加顺序

切片业务图层通常不透明，直接叠会盖住底图。`createWMTSLayer()` 默认
`alpha = 0.7`（30% 透明），底图显式传 `alpha: 1`。

`imageryLayers.add(layer, index)` 的 index 是**插入位置**；要在底图之上、
业务切片之下叠一层客户端填充，可以固定插到索引 2（详见 `fill-imagery.md`）。

## 排查顺序

1. Network 看瓦片请求的 URL，确认 `TileMatrix` 级号是否落在服务范围内；
2. 对比 Capabilities 的 `TileMatrix` 标签与 Cesium 请求的级号（差 1 级最常见）；
3. 检查 `tilingScheme` 与 `tileMatrixSetID` 是否一致；
4. 检查 CORS / Referer / token；
5. 最后才怀疑瓦片本身。

## 本仓库实现

- `src/utils/layers/basemap.js`：XYZ / WMTS 底图创建与切换；
- `src/utils/layers/wmts.js`：`createWMTSProvider()` / `createWMTSLayer()`；
- `public/config/app.js`：底图与可切换底图清单。

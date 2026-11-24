# 坐标系处理 — Cesium vs ArcGIS vs OGC 服务

## 背景

Cesium 内部渲染使用 **WGS84（EPSG:4326）** 椭球。国内 GIS 数据常见
**CGCS2000（EPSG:4490）**，两者在米级以上几乎一致（差异在厘米级），但不同协议
由谁负责重投影并不相同。切到 Cesium 后，最容易踩的坑就是把「经纬度」直接当
「Cartesian3」用，或者以为服务端会自动转坐标。

## 各协议的重投影方式

### WMS — 服务端重投影

```js
parameters: {
  crs: "EPSG:4326", // 明确要求服务端输出 WGS84
}
```

WMS 规范支持 `crs` / `srs` 参数，服务器按需重投影。前提是 GetCapabilities
里声明了目标 CRS。每张瓦片都要服务端实时渲染并重投影，通常比 WMTS 慢。

**谁负责转换：** 服务端。

### WMTS — 客户端重投影

WMTS 是预切瓦片，服务端不做重投影。`WebMapTileServiceImageryProvider` 拿到瓦片后
由 Cesium 在客户端做坐标变换，映射到 WGS84 椭球上。

```js
{
  url: "https://example.com/wmts?layer=demo&style=default&tilematrixset=EPSG:4490&TileMatrix={TileMatrix}&TileRow={TileRow}&TileCol={TileCol}",
  layer: "demo",
  style: "default",
  tileMatrixSetID: "EPSG:4490",
  tilingScheme: "geographic", // 经纬度切片
}
```

**谁负责转换：** Cesium 客户端。
**注意：** `tileMatrixSetID` 与 `tilingScheme` 要匹配（经纬度用 `GeographicTilingScheme`，
Web Mercator 用 `WebMercatorTilingScheme`），否则瓦片位置会整体偏移。

### WFS — GeoJSON 规范强制 WGS84

GeoJSON（RFC 7946）要求坐标必须是 WGS84 经纬度。ArcGIS Server 的
`outputFormat=GEOJSON` / `f=geojson` 会自动把源数据（包括 EPSG:4490）转成 WGS84。

标准 OGC WFS 如果只输出 GML，则可能带原始 CRS，前端需要额外转换。

**谁负责转换：** GeoJSON 规范 / 服务端。
**前提：** 使用 `outputFormat=application/json` 或 ArcGIS REST 的 `f=geojson`。

### 3D Tiles — 规范内置 WGS84

3D Tiles 的 `region` / `box` / `sphere` 等包围体使用 WGS84 或 ECEF 坐标，
不需要额外处理。模型的 `transform` 也是 ECEF 下的 4×4 矩阵。

### ArcGIS REST — `f=geojson` 自动转换

ArcGIS Server 在 `f=geojson` 时自动输出 WGS84，这一点和业务后端返回 WKT 不同：
WKT 默认带源坐标系，需要确认是不是经纬度（4490 / 4326），不能在未知坐标系下直接渲染。

## ArcGIS JS API 的差异

ArcGIS 的 `SceneView` 底层也在 WGS84 椭球上渲染，但框架帮你处理了大部分 CRS 细节：

- 2D `MapView` 支持 Web Mercator 和任意投影坐标系；
- 3D `SceneView` 与 Cesium 一样固定在 WGS84；
- 没有类似 `CESIUM_BASE_URL` 那种「必须在加载前设置」的全局配置。

所以 ArcGIS 项目里很少感知 CRS 问题，切到 Cesium 后需要自己判断每种协议谁转坐标。

## 实战 Checklist

| 服务类型                | 坐标系策略              | 注意事项                                        |
| ----------------------- | ----------------------- | ----------------------------------------------- |
| WMS                     | 服务端：`crs=EPSG:4326` | 检查 GetCapabilities 是否声明目标 CRS           |
| WMTS                    | 客户端：Cesium 自动     | 注意 `tileMatrixSet` 的 CRS，客户端一定会重投影 |
| WFS（GeoJSON）          | GeoJSON 规范            | 确认服务端输出 `application/json` / `GEOJSON`   |
| WFS（GML）              | 需要手动转换            | GML 带原始 CRS，需解析 `srsName`                |
| 3D Tiles                | 原生 WGS84              | 规范内置，无需处理                              |
| ArcGIS REST `f=geojson` | 服务端自动              | ArcGIS Server 自动转 WGS84                      |
| 业务后端 WKT            | 看数据源                | 确认是经纬度再当前端几何用                      |

## 高度：椭球高 vs 大地水准面

Cesium 的 `Cartographic.height` 与 `Cartesian3.fromDegrees(lon, lat, height)` 里的高度
都是**椭球高**（相对 WGS84 椭球面），不是 ArcGIS 常见的 EGM2008 大地水准面高。
需要精确换算时要接 Geoid 服务；普通三维展示按米级误差处理即可。

## 本仓库实现

- `src/utils/layers/wmts.js`：`resolveTilingScheme()` / `toRectangle()`；
- `src/utils/layers/wfs.js`：WFS 直接取 GeoJSON；
- `src/utils/layers/geojson.js`：内存 GeoJSON（WGS84）。

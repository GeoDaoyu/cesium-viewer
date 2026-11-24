# WKT 几何处理

## 什么时候会拿到 WKT

- 业务后端返回要素几何（`shape` / `geomWkt` 字段）；
- 地图服务的要素查询接口带 `withGeometry=true` 时，几何常在 `shape` 字段；
- 数据库 / 文件导出的空间数据。

Cesium 不直接吃 WKT，需要先转成 GeoJSON 或 `Cartesian3` 数组。

## WKT → GeoJSON

常见类型：

```
POINT (116.4 39.9)
LINESTRING (116.3 39.8, 116.5 39.9)
POLYGON ((116.2 39.8, 116.5 39.8, 116.5 40.0, 116.2 40.0, 116.2 39.8))
MULTIPOLYGON (((...)), ((...)))
GEOMETRYCOLLECTION (POINT (...), POLYGON (...))
```

解析要点：

- WKT 的坐标顺序是 **x y**（经度 纬度），GeoJSON 也是 `[lon, lat]`，顺序一致；
- 多边形第一个环是外环，后续环是洞；
- 环必须闭合（首尾坐标相同），不闭合时补一个点；
- 支持 `Z` / `M` 维度时，Cesium 只关心前两维（高度另算）；
- 解析失败要返回 `null`，不要让一个坏几何拖垮整批数据。

本仓库 `src/utils/wkt.js` 提供 `wktToGeoJson()` 与 `geoJsonToWkt()`，覆盖
POINT / LINESTRING / POLYGON / MULTI* / GEOMETRYCOLLECTION。

## 坐标系要先确认

WKT 本身不带坐标系。业务后端返回的 WKT 常见两种情况：

- **经纬度**（CGCS2000 / WGS84）：可以直接当 GeoJSON 用（厘米级差异可忽略）；
- **投影坐标**（如 Web Mercator，单位米）：不能直接当经纬度，必须先反投影。

判断方法：看坐标数值范围。经度应在 -180~~180、纬度 -90~~90；出现六七位数基本就是投影坐标。

## 前端高亮

拿到 GeoJSON 后，用 `GeoJsonDataSource` 画一份临时高亮：

```js
const dataSource = await Cesium.GeoJsonDataSource.load(
  { type: "Feature", geometry, properties: {} },
  { clampToGround: true },
);
viewer.dataSources.add(dataSource);
```

高亮层要点：

- 标记为不参与拾取（`pickable: false`），否则下一次点击命中高亮层；
- 用固定 `name`，便于「清除高亮」按名称扫描；
- 只用于视觉叠加，属性弹窗的数据仍来自原始要素；
- 面高亮抬一点高度或走贴地通道，避免和底图 z-fighting；
- 只在需要时画，切换选中 / 关闭弹窗 / 离开页面时摘掉。

## WKT 作为查询参数

地图服务的 `spatialFilter` 接收 WKT：

```js
const wkt = `POLYGON ((${lon - d} ${lat - d}, ${lon + d} ${lat - d}, ${lon + d} ${lat + d}, ${lon - d} ${lat + d}, ${lon - d} ${lat - d}))`;

const url = `${queryUrl}?spatialFilter=${encodeURIComponent(wkt)}&limit=1`;
```

- WKT 里空格和括号很多，必须 `encodeURIComponent()`；
- 不要用 `URLSearchParams` 把空格编成 `+`，部分服务端解析不了；
- WKT 很长（复杂面）时改用 POST，GET 会超过 URL 长度限制。

## 常见坑

- 环不闭合：Cesium 可能不渲染或只画出一条线；
- 经纬度顺序写反：点跑到南极 / 数据整体偏移；
- 投影坐标当经纬度：地球上看不到，或飞到离谱位置；
- 高亮层参与拾取：点图查询失效；
- WKT 里带 `SRID=4490;` 前缀：解析前先剥掉，Cesium 不需要 SRID。

## 本仓库实现

- `src/utils/wkt.js`：解析 / 序列化；
- `src/utils/layers/geojson.js`：GeoJSON 数据源与样式；
- `src/services/themeQuery.js`：查询结果里的 `shape` 解析。

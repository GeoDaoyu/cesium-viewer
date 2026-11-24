# WFS 要素查询

## 基本请求

WFS 2.0 的 `GetFeature` 通过 URL 参数取数据。ArcGIS Server 的 WFS 端点通常是：

```
https://example.com/server/services/<服务名>/MapServer/WFSServer
```

最小请求：

```
?service=WFS
&version=2.0.0
&request=GetFeature
&typeNames=<命名空间>:<图层名>
&outputFormat=GEOJSON
```

注意：

- `typeNames` 一般要带命名空间前缀（`namespace:layerName`），具体以
  `GetCapabilities` 里的 `<Name>` 为准；
- 中文图层名、字段名要 `encodeURIComponent()`；
- `outputFormat` 用 `GEOJSON` / `application/json` 时返回标准 GeoJSON；
  只支持 GML 的服务要自己解析 `gml:featureMember`。

## 分页

WFS 2.0 用 `count` + `startIndex`：

```
&startIndex=0&count=20
```

WFS 1.1.0 用 `maxFeatures` + `startIndex`，两套参数不能混用。

查询总数通常发一次 `resultType=hits`：

```
&resultType=hits&typeNames=...
```

响应是 XML，从 `numberMatched` 属性解析：

```js
const total = Number(/numberMatched="(\d+)"/.exec(xml)?.[1] ?? 0);
```

不要对 hits 响应做 `JSON.parse()`。

## FES 2.0 过滤

属性过滤用 FES 2.0 XML，通过 `filter` 参数传：

```xml
<fes:Filter xmlns:fes="http://www.opengis.net/fes/2.0">
  <fes:PropertyIsEqualTo>
    <fes:ValueReference>name</fes:ValueReference>
    <fes:Literal>示例名称</fes:Literal>
  </fes:PropertyIsEqualTo>
</fes:Filter>
```

多条件用 `<fes:And>` 包起来；空条件不要传 `filter`，否则部分服务会报错。
构造 XML 时记得转义 `<` / `&` / 引号。

空间过滤可以用 `<fes:Intersects>` + `<gml:Polygon>`；点图查询更常用的是
服务端扩展的 `spatialFilter`（见 `point-query.md`），两者不要混。

## 坐标系

`outputFormat=GEOJSON` 时，GeoJSON 规范强制 WGS84，ArcGIS Server 会自动把源数据
（例如 CGCS2000 / EPSG:4490）转成 WGS84，前端不用再处理。

如果服务只输出 GML，则可能带原始 `srsName`，需要先转换再交给 Cesium。
详见 `coordinate-systems.md`。

## 前端加载

拿到 GeoJSON 后可以直接用 `GeoJsonDataSource`：

```js
const dataSource = await Cesium.GeoJsonDataSource.load(geojson, {
  clampToGround: true,
});
viewer.dataSources.add(dataSource);
```

如果 URL 直接返回 GeoJSON，也可以把 URL 交给 `GeoJsonDataSource.load()`，
但要注意跨域、鉴权头、以及加载期间 Viewer 可能已被销毁。

## 常见坑

- **`count` 与 `maxFeatures` 混用**：版本不同参数不同，混用会忽略分页；
- **命名空间缺失**：`typeNames` 不带前缀时返回 `Feature type not found`；
- **中文未编码**：URL 里直接拼中文可能被代理截断；
- **hits 响应当 JSON 解析**：它是 XML；
- **大图层全量拉取**：WFS 没有服务端聚合，几十万条会拖死浏览器；能只取 count 就取 count，
  能按 `spatialFilter` 单点查就不要全量。

## 本仓库实现

- `src/utils/layers/wfs.js`：`GeoJsonDataSource` 加载 + 样式；
- `src/utils/layers/themeLayer.js`：`type: "wfs"` 的地址拼装与分发；
- `src/utils/appConfig.js`：`wfsUrl()`。

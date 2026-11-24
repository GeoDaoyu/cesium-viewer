# 地图服务网关的几种接口

这里说的「地图服务」是出图 / 查询的 GIS 网关（MapServer 一类），不是业务后端。
常见接口可以归成四类：范围、图例、计数、要素查询。

## 1. GetCapabilities：拿服务范围

WMTS 的 `GetCapabilities` 返回每个图层的 `ows:WGS84BoundingBox`：

```
GET <wmtsRoot>/<服务名>/<样式名>?service=WMTS&request=GetCapabilities&version=1.0.0
```

解析 `<Layer>` 下的 `LowerCorner` / `UpperCorner`，得到该服务自己的精确范围，
再交给：

```js
viewer.camera.flyTo({ destination: Cesium.Rectangle.fromDegrees(w, s, e, n) });
```

不要用「全省 / 全国外接矩形」代替服务范围：小范围服务会飞到很远，看起来像没定位。

Capabilities 按服务缓存，避免每次勾选都请求。

## 2. 图例：styleInfo

图例接口通常按「服务名 + 样式名 + 级号」返回：

```
GET <legendRoot>/styleInfo/<serverName>/<styleId>/<level>/legend.json
```

- `level` 可省略，服务端返回按级号区间分组的结果（如 `{ "7-15": {...} }`）；
- 前端按当前相机级号选区间；
- 返回的 `legends` 是扁平数组，用 `pid` 表达父子关系；
- 父项有子项时只展示子项；没有子项时父项自己就是一条图例。

前端只负责请求与解析，不在配置里手写图例。`src/services/legend.js` + `src/utils/legend.js`。

## 3. 计数：/count

统计「这个图层有多少要素」不要拉全量：

```
GET <queryRoot>/<serverName>/<layerName>/count
→ { "count": 12345 }
```

服务端只跑一次 `count(*)`，大图层也是秒级。全量 `/query` 在几十万条时通常超时。

## 4. 要素查询：/query

```
GET <queryRoot>/<serverName>/<layerName>/query
    ?spatialFilter=<WKT>
    &limit=1
    &withGeometry=true
```

- 必须带过滤条件（`spatialFilter` 或 `filter`），否则是全表查询；
- `withGeometry=true` 时几何一般在 `shape` 字段（WKT），解析成 GeoJSON 后从属性里剔除；
- 返回体可能是扁平数组，也可能是 `{ result: [...] }`，按实际服务兼容。

按属性查询用 `filter`（SQL 片段）：

```
filter=name='示例名称'
```

引号要转义；WKT 很长时必须 POST，GET 会超过 URL 长度限制。

## 5. 命名约定

- 服务名通常大写（`DEMO_LAYER`），查询图层名通常是服务名的小写
  （`demo_layer`），但两者不一定总是一致；
- WMTS 的 `style` 是样式名，不等于图层名，也不等于查询图层名；
- 配置里最好把 `serverName` / `styleId` / `queryLayerName` 分开写，不要互相猜。

## 6. 常见坑

- 用 `GetCapabilities` 的路径形式（`/GetCapabilities`）访问只支持 KVP 的服务 → 404；
- 图例接口的级号是**服务级号**，不是 Cesium 级号，需要加 `levelOffset`；
- `/count` 查的是底表，字段名可能比 `/query` 少，过滤条件字段要先确认；
- 查询服务与图例服务不一定同一个网关，配置里分开写。

## 本仓库实现

- `src/services/legend.js`、`src/utils/legend.js`：图例请求与解析；
- `src/services/themeQuery.js`：query / count 封装；
- `src/utils/appConfig.js`：各类 URL 拼接；
- `src/utils/camera/flyToExtent.js`：按范围飞行。

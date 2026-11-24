# 点图查询与高亮

## 场景

地图上叠的是服务端出图的 WMTS（不是前端矢量），点击时需要反查「这个像素下是哪个要素」。
常见做法是调用地图服务的要素查询接口，用点击点构造空间过滤条件，只取一条要素。

## 查询流程

1. 屏幕点击 → 经纬度（优先 `scene.globe.pick()` / `camera.pickEllipsoid()`）；
2. 以点击点为中心构造一个很小的闭合矩形（WKT），例如容差 `0.0001°`；
3. 请求查询接口：

```
GET <queryRoot>/<serverName>/<layerName>/query
    ?spatialFilter=<闭合面 WKT>
    &limit=1
    &withGeometry=true
```

4. 命中要素的 `shape` / `geometry` 字段是 WKT，解析成 GeoJSON；
5. 用 GeoJSON 画一份红色高亮，同时把属性交给属性弹窗。

**必须带 `spatialFilter`**：不传就是全表查询，大图层可能返回几十 MB，直接把页面拖死。

## 多层查询顺序

地图上通常同时叠着多个图层。把查询源按**屏幕叠放顺序（上层 → 下层）**排成数组，
从上往下逐个查，命中即停：

- 上层小范围图层没盖住点击点时，还能落到下面的全图图层；
- 单个图层请求失败（404 / 超时）只记日志、继续查下一层，不要让一个坏服务吞掉整次点击；
- 连续点击时用 `AbortController` 取消上一次请求，并用序号丢弃过期结果。

## 高亮的两种做法

### 1. 改实体自身样式

适用于前端矢量图层（WFS / GeoJSON）。保存原始材质 / 颜色 / 线宽，改成高亮色，
关闭时恢复。同一时间只保留一份高亮，切换前先恢复上一次。

### 2. 独立高亮数据源

适用于 WMTS 这类没有前端实体的图层：把查询返回的 WKT 画成一份临时
`GeoJsonDataSource`（红色半透明面 + 描边），不修改业务图层。

要点：

- 高亮数据源必须**不参与拾取**（`pickable: false`），否则下一次点击会命中高亮层自己，
  查不到下面的业务图层；
- 高亮数据源的 `name` 用固定值，工具栏的「清除高亮」按 name 扫描；
- 查询是异步的：清除 / 切图层 / 关弹窗时要取消在途请求，并让旧结果作废，
  否则请求回来又把高亮画上。

## 拾取穿透

Cesium 的 `scene.pick()` 返回最上层对象。如果顶部是半透明高亮面，点击会被它吃掉。
解决办法：

```js
const entity = viewer.scene
  .drillPick(position)
  .find(
    (picked) =>
      Cesium.defined(picked) &&
      picked.id instanceof Cesium.Entity &&
      !isHighlightEntity(picked.id),
  )?.id;
```

本项目把「哪些数据源不参与拾取」记在 `WeakSet` 里，用
`markDataSourceNonPickable()` 标记，统一走 `pickEntity()`，不要直接写 `scene.pick()`。

另外，点到 3D Tiles 模型时要单独排除（模型的瓦片要素不是 Entity），否则会穿透到
模型下面的 WMTS 面，弹出一个不相干的属性框。

## 常见坑

- **不带 `spatialFilter`**：全表查询，慢到超时；
- **WKT 用 `+` 编码空格**：服务端可能解析失败，用 `encodeURIComponent()`；
- **多层不排序**：先查到大范围图层，永远命不中小范围图层；
- **高亮层参与拾取**：第二次点击查不到业务图层；
- **异步竞态**：慢请求回来覆盖了新点击的结果，要用序号 / AbortController。

## 本仓库实现

- `src/components/map-components/PointQuery/usePointQuery.js`：交互与高亮；
- `src/services/themeQuery.js`：查询接口封装；
- `src/utils/clickQuery.js`：点击点 → 经纬度 / 闭合小矩形；
- `src/utils/pick.js`：跳过不可拾取的数据源。

# ArcGIS Popup vs Cesium InfoBox vs 自定义弹窗

## 概览

|            | ArcGIS `Popup`        | Cesium `InfoBox`   | 自定义 React 弹窗      |
| ---------- | --------------------- | ------------------ | ---------------------- |
| 是否内置   | 是                    | 是                 | 否                     |
| 样式控制   | 有限，可通过 CSS 覆盖 | 有限，DOM 结构固定 | 完全可控               |
| 多字段展示 | 内置字段信息          | 内置，但样式弱     | 自己渲染表格           |
| 与地图联动 | 自带定位 / 高亮       | 选中实体时自动显示 | 自己维护选中态与坐标   |
| 适用       | 快速原型              | 简单属性查看       | 需要统一 UI / 复杂交互 |

## ArcGIS Popup

`MapView` / `SceneView` 自带 `popup`，配置 `popupTemplate` 后点击图层要素自动弹出：

```js
layer.popupTemplate = {
  title: "{name}",
  content: [
    { type: "fields", fieldInfos: [{ fieldName: "name", label: "名称" }] },
  ],
};
```

优点是开箱即用；缺点是 DOM 结构、定位、样式定制空间有限，和项目 UI 风格统一时
通常要大量覆盖 CSS。

## Cesium InfoBox

Viewer 构造时 `infoBox: true`（默认开），点击 Entity 时显示：

```js
new Cesium.Viewer(container, { infoBox: true });
```

`InfoBox` 读取 `entity.name` / `entity.description`，`description` 可以是 HTML 字符串
或 `PropertyBag`。局限：

- DOM 结构固定，样式难统一；
- 只认 Entity，3D Tiles 瓦片要素、WMTS 查询结果都不适用；
- 展示字段需要自己拼 HTML，没有字段白名单 / 中英文映射；
- 移动端定位和遮挡处理一般。

## 自定义 FeaturePopup

本仓库的做法：不启用 Cesium `infoBox`，自己维护选中要素，用一个绝对定位的 React 组件
渲染在地图上。

### 数据流

```
点击 / 点图查询
  → 得到 { properties, screenX, screenY }
  → useMapStore.setSelectedFeature()
  → <FeaturePopup /> 渲染
  → 关闭时 clearSelection()
```

### 实现要点

- `position: absolute` + 点击位置偏移，跟随地图画布；
- 字段白名单：只展示配置里收录的字段，避免 `OBJECTID` / `SHAPE` 等系统字段；
- 字段名映射：英文 → 中文，支持忽略大小写（不同服务字段名大小写不统一）；
- 中文字段名直接展示；
- 点击空白 / 关闭按钮 / 清除高亮时同步关闭；
- 点图查询和实体点击共用同一个弹窗，只是 `title` 不同。

### 设计取舍

- 不用 Cesium 内置 `infoBox`：样式与交互不可控；
- 不用 ArcGIS 式 `popupTemplate`：Cesium 没有等价物，且业务字段映射逻辑更复杂；
- 弹窗不直接绑定 Entity：3D Tiles / WMTS 查询结果也能复用同一套 UI。

## 常见坑

- **弹窗位置随相机移动而错位**：screenX / screenY 是点击瞬间的坐标，拖动地图后不会更新；
  要么关闭弹窗，要么每帧重新投影世界坐标；
- **点击弹窗本身触发地图点击**：给弹窗加 `stopPropagation`，或让 Cesium 的 handler
  判断事件目标；
- **InfoBox 与自定义弹窗同时出现**：构造 Viewer 时把 `infoBox` 设为 `false`；
- **字段太多撑爆屏幕**：限制高度 + 内部滚动。

## 本仓库实现

- `src/components/FeaturePopup/index.jsx`；
- `src/components/HoverPopup/index.jsx`；
- `src/utils/appConfig.js`：`fieldLabel()` / `hasFieldLabel()`。

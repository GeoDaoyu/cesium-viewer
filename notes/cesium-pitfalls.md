# Cesium 零散坑位

## 1. `CESIUM_BASE_URL` 必须在 Cesium 之前设置

Cesium 在模块初始化时读取 `window.CESIUM_BASE_URL`。UmiJS 项目通过 `headScripts`
在应用 bundle 之前注入：

```js
// public/cesiumInit.js
window.CESIUM_BASE_URL = "./cesium/";
```

不要用打包器的 `define` 替换：替换后的字符串可能带引号，URL 变成 `%22./cesium/%22`，
Worker 全部 404。详见 `cesium-vs-arcgis-static-assets.md`。

## 2. `camera.changed` 是下一帧触发

`camera.setView()` 之后立刻读 `camera.position` 是对的，但 `camera.changed` 事件
要等下一动画帧才触发。如果依赖事件把相机状态写进 store，`setView()` 后要手动同步一次：

```js
viewer.camera.setView({ ... });
handleCameraChange(); // 手动同步
```

另外，`camera.changed` 在飞行过程中持续触发，最后一帧未必正好落在终点；
需要精确终态时同时监听 `camera.moveEnd`。

## 3. antd 的 `style` 字段会吃掉配置

如果配置条目里有 `style: "layer_style"`（WMTS 样式名），不要原样传给 antd 的
`TreeSelect` / `Select`。antd 会把 `style` 当 CSS 对象展开：

```js
// 字符串被展开成 { 0: "l", 1: "a", ... }
```

React 写 `style["0"]` 时会抛
`Failed to set an indexed property [0] on 'CSSStyleDeclaration'`，整页白屏。

传给 antd 前只保留 `title` / `value` / `children`，业务字段在配置里保持原名，
组件内部用 `value` 查表。

## 4. 切片图层默认 30% 透明

`createWMTSLayer()` 在没传 `alpha` 时用 `0.7`，避免业务切片完全盖住底图。
底图必须显式 `alpha: 1`，否则两层影像会互相透出，切换时出现「叠影」。

## 5. `baseLayer` 不能返回 `undefined`

```js
baseLayer: createBasemapLayer(BASEMAP);
```

没有配置底图时函数要返回 `false`（Viewer 不建底图）。返回 `undefined` 时 Cesium 会用
默认的 Ion 全球影像兜底，表现为「明明没配底图却在请求 Ion / 报 token 错误」。

## 6. Viewer 销毁后不要再访问

`viewer.isDestroyed()` 是唯一可靠的判断。异步回调里要同时检查：

```js
if (!viewer || viewer.isDestroyed()) return;
```

`viewer` 引用还在，不代表内部 `_cesiumWidget` 还在；`viewer.camera` 会抛
`Cannot read properties of undefined (reading 'scene')`。

## 7. CORS 与 Referer

浏览器端直接请求瓦片 / WFS / 地形时，服务端必须允许页面 Origin。

- 瓦片服务可能校验 Referer；
- 带 token 的 URL 不要把 token 写进前端日志；
- 本地开发用代理时，注意 `pathRewrite` 不要破坏 `{z}/{x}/{y}` 占位符。

## 8. 时钟没开，动画不动

`CallbackProperty` 依赖 `viewer.clock.shouldAnimate = true`。默认是 `false`，
表现为「代码明明写了动画，但画面不动」。详见
`cesium-animation-callbackproperty.md`。

## 9. 影像层索引不是「层级」

`imageryLayers.add(layer, index)` 的 index 是数组插入位置，不是 z-index。
业务切片和客户端填充的叠放顺序靠插入位置控制；矢量面的层级靠 `zIndex` + 渲染通道，
两者不要混。详见 `fill-imagery.md` 与 `polygon-z-fighting.md`。

## 10. 大量 Entity 会拖慢

Entity 每帧都要评估属性、更新 visualizer。几百个以内没问题；上千个静态要素优先用
Primitive / 3D Tiles，动态轨迹再考虑自定义 Primitive。

## 本仓库相关文件

- `public/cesiumInit.js`
- `config/config.js`
- `src/components/CesiumViewer/index.jsx`
- `src/components/map-components/ThemeSwitcher/index.jsx`
- `src/utils/layers/wmts.js`

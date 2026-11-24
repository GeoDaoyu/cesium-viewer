# Cesium vs ArcGIS — 静态文件处理对比

## 概览

| 维度     | ArcGIS JS API             | CesiumJS                                                         |
| -------- | ------------------------- | ---------------------------------------------------------------- |
| 静态资源 | 主要是一个 `assets/` 目录 | 四个独立目录：`Workers` / `Assets` / `Widgets` / `ThirdParty`    |
| 路径配置 | 可运行时设置              | 必须在 Cesium 模块加载前设置全局变量                             |
| 开发环境 | 框架 / CDN 自带           | 需要把 `node_modules/cesium/Build/Cesium` 下的目录复制到静态目录 |
| 构建     | 通常开箱即用              | 需要保证四个目录随产物一起部署                                   |

## 为什么 Cesium 需要四个目录

Cesium 运行时会在以下场景按需请求静态文件：

- `Workers/`：几何计算、瓦片解码等 Web Worker 脚本，路径通过 `CESIUM_BASE_URL` 拼出；
- `Assets/`：内置纹理、图标、近似地形高度数据（`approximateTerrainHeights.json`）；
- `Widgets/`：控件样式与图片；
- `ThirdParty/`：Draco 解码器等第三方运行时。

少任何一个目录，控制台会出现 404，表现为地球不显示、模型加载失败、控件样式错乱等。

## CESIUM_BASE_URL 的时序

Cesium 在模块初始化时就会读取 `window.CESIUM_BASE_URL`，所以必须**在 Cesium JS 执行前**设置：

```html
<script>
  window.CESIUM_BASE_URL = "./cesium/";
</script>
<script src="./umi.js"></script>
```

在 UmiJS 里通过 `config/config.js` 的 `headScripts` 注入 `public/cesiumInit.js`，
顺序要排在应用 bundle 之前。

**不要**用打包器的 `define` / DefinePlugin 替换这个路径：替换后的字符串可能带引号，
运行时 URL 会变成 `%22./cesium/%22`，Worker 全部 404。

## 开发环境

`postinstall` 时把 `node_modules/cesium/Build/Cesium/{Workers,Assets,Widgets,ThirdParty}`
复制到 `public/cesium/`，开发服务器直接托管。`public/cesium` 不入库（体积大且可再生成）。

```json
{
  "postinstall": "max setup && node scripts/copyCesiumAssets.mjs"
}
```

## 生产环境

UmiJS / Webpack 会把 `public/` 原样复制到 `dist/`，因此 `dist/cesium/` 自然就位。
部署时注意：

- `CESIUM_BASE_URL` 用相对路径 `./cesium/`，部署到子目录也能取到；
- 确认 Nginx / 静态服务器没有把 `.js` Worker 当成普通脚本改写 MIME；
- 若站点启用了 CSP，需要允许 `worker-src` 与 `blob:`（Cesium 部分 Worker 用 blob 创建）。

## 排查顺序

1. Network 面板看 `cesium/Workers/*.js` 是否 404；
2. 404 时先检查 `window.CESIUM_BASE_URL` 的值与页面 URL 的拼接结果；
3. 再检查 `dist/cesium/` 四个目录是否完整；
4. 最后检查反向代理是否改写了 `cesium/` 路径。

## 本仓库实现

- `public/cesiumInit.js`：设置 `CESIUM_BASE_URL`；
- `scripts/copyCesiumAssets.mjs`：安装时复制四个目录；
- `config/config.js`：`headScripts` 的顺序。

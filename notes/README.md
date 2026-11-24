# Cesium 技术笔记

这里是从实际 Cesium 项目里抽出来的**通用技术记录**，按主题分文件，方便单独查阅。

- 所有服务地址、坐标系示例、图层名均为占位或虚构值，不对应任何线上环境。
- 只保留通用 Cesium / GIS 技术；业务数据源、特定环境的服务清单这类内容不收录。
- 代码位置以本仓库的 `src/` 为准；与原始项目不同的地方以本仓库实现为准。

## 索引

| 文件                                                                         | 主题                                                        |
| ---------------------------------------------------------------------------- | ----------------------------------------------------------- |
| [cesium-for-arcgis-developers.md](cesium-for-arcgis-developers.md)           | 从 ArcGIS 迁移到 Cesium 的核心概念、Entity / Primitive 选型 |
| [cesium-vs-arcgis-mouse-controls.md](cesium-vs-arcgis-mouse-controls.md)     | 鼠标操作差异与 ArcGIS 风格键位配置                          |
| [cesium-vs-arcgis-static-assets.md](cesium-vs-arcgis-static-assets.md)       | 静态资源目录、`CESIUM_BASE_URL` 与构建差异                  |
| [coordinate-systems.md](coordinate-systems.md)                               | WMS / WMTS / WFS / 3D Tiles 各自由谁重投影                  |
| [basemap.md](basemap.md)                                                     | 底图与 WMTS 参数、级号偏移、切片方案、常见坑                |
| [terrain.md](terrain.md)                                                     | 标准 Cesium 地形接入；非标准地形的自定义 Provider 思路      |
| [wfs-feature-query.md](wfs-feature-query.md)                                 | WFS 2.0 查询、分页、FES 过滤、编码与坐标系                  |
| [point-query.md](point-query.md)                                             | 点击地图查询切片图层要素（`spatialFilter`）与高亮           |
| [map-server-services.md](map-server-services.md)                             | 地图服务网关：范围、图例、计数、要素查询接口                |
| [wkt-geometry.md](wkt-geometry.md)                                           | WKT 解析、坐标系判断、前端高亮与空间过滤                    |
| [3d-tiles.md](3d-tiles.md)                                                   | 3D Tiles 加载、高度偏移、样式、飞定位                       |
| [polygon-z-fighting.md](polygon-z-fighting.md)                               | 面图层重叠闪烁、`clampToGround + zIndex`、渲染通道与拾取    |
| [fill-imagery.md](fill-imagery.md)                                           | 把面填充栅格化成影像层，垫在其它切片图层下面                |
| [camera-roaming.md](camera-roaming.md)                                       | 视角飞行与连续漫游插值                                      |
| [viewer-lifecycle-route-switch.md](viewer-lifecycle-route-switch.md)         | Viewer 销毁重建、路由切换时的异步竞态                       |
| [cesium-animation-callbackproperty.md](cesium-animation-callbackproperty.md) | `CallbackProperty` 动画与 `clock.shouldAnimate`             |
| [popup-comparison.md](popup-comparison.md)                                   | ArcGIS Popup、Cesium InfoBox 与自定义属性弹窗               |
| [cesium-pitfalls.md](cesium-pitfalls.md)                                     | 零散但容易踩的坑：资源路径、事件时序、antd 集成等           |

## 本仓库里的对应实现

- Viewer 初始化与点击 / 悬停：`src/components/CesiumViewer/index.jsx`
- 图层加载：`src/utils/layers/`
- 点图查询：`src/components/map-components/PointQuery/`
- 图层树与默认勾选：`src/components/map-components/ThemeSwitcher/`
- 相机漫游：`src/utils/camera/roaming.js`
- 运行时配置：`public/config/app.js`、`src/utils/appConfig.js`

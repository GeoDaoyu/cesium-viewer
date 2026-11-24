/**
 * 运行时配置（结构示例）
 *
 * 本文件放在 public/ 下，构建时原样复制到 dist/config/，部署后可直接修改，
 * 无需重新打包。它通过 config/config.js 的 headScripts 在应用代码之前加载，
 * 挂到 window.appcfg，由 src/utils/appConfig.js 统一读取。
 *
 * 这里只保留配置**结构**：所有需要对接的实际服务地址（后端、地图服务、图例、
 * 查询、地形、3D Tiles）都以空串 / 空对象占位，按现场环境填写即可。
 * 默认值只使用公开的 Esri 底图和仓库内的示例数据，保证 clone 下来能直接跑起来。
 */
window.appcfg = {
  // 允许其他分片先挂字段（多文件配置时用；单文件可忽略）
  ...(window.appcfg || {}),

  // ------------------------------------------------------------
  // 基础信息
  // ------------------------------------------------------------
  title: "Cesium Viewer",
  subtitle: "UmiJS + Cesium 三维地球示例",

  // 可选的 Cesium ION Token：仅在加载 ionAssetId 形式的 3D Tiles 时需要。
  // 底图与地形都不依赖 Ion，留空即可。
  cesiumIonToken: "",

  // ------------------------------------------------------------
  // 底图
  // ------------------------------------------------------------
  // 默认底图。type 支持：
  //   "xyz"  —— 标准 XYZ / Web Mercator 瓦片模板（{z}/{x}/{y}）
  //   "wmts" —— OGC WMTS，参数同 src/utils/layers/wmts.js
  basemap: {
    type: "xyz",
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    maximumLevel: 19,
    credit: "Esri, Maxar, Earthstar Geographics",
  },

  // 可切换底图清单（左上角下拉）。为空数组时只显示上面的 basemap，不渲染切换器。
  // 每一项结构与 basemap 相同；示例给的是公开底图，现场可换成自己的服务。
  basemapServices: [
    {
      value: "esri-imagery",
      label: "卫星影像",
      type: "xyz",
      url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      maximumLevel: 19,
      credit: "Esri, Maxar, Earthstar Geographics",
    },
    {
      value: "esri-street",
      label: "街道地图",
      type: "xyz",
      url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}",
      maximumLevel: 19,
      credit: "Esri",
    },
  ],

  // ------------------------------------------------------------
  // 三维地形（标准 Cesium quantized-mesh / heightmap）
  // ------------------------------------------------------------
  // 填 CesiumTerrainProvider 的根地址（目录下有 layer.json 即可）。
  // 留空则不挂地形，地球保持光滑椭球。
  terrain: {
    url: "",
    requestVertexNormals: true,
    requestWaterMask: false,
  },

  // 3D Tiles 加载后的整体抬升高度（米）。倾斜模型 / Mesh 与地形常有系统性高程差，
  // 贴地后底部会陷进去，统一抬一点；写 0 表示不抬升。
  tilesetHeightOffset: 5,

  // ------------------------------------------------------------
  // 专题图层树（地图左上角的树形多选）
  // ------------------------------------------------------------
  // 每个叶子是一条图层，`type` 决定加载方式：
  //   wfs      —— WFS GetFeature（需 service + typeName，service 取 mapServices 的 key）
  //   wmts     —— OGC WMTS（需 url）
  //   geojson  —— 本地 / 跨域 GeoJSON 文件（需 url）
  //   markers  —— 配置里直接写死的标注点（需 points）
  //   3dtiles  —— 3D Tiles（需 url，指向 tileset.json）
  // 可选 `group` 聚成父节点、`year` 组内倒序；`label` 是显示名。
  //
  // 下面的示例图层只依赖仓库内数据，开箱即可看到效果；服务类图层的地址留空，
  // 填好地址（以及 wfs 的 service / typeName）后就会出现在树上并可加载。
  themeOptions: [
    {
      label: "示例区域",
      value: "demo-areas",
      type: "geojson",
      url: "./geojson/demo-areas.geojson",
      fillColor: "#1f6feb",
      fillOpacity: 0.35,
      strokeColor: "#7cc4ff",
      strokeWidth: 1.2,
      labelField: "name",
      showLabel: true,
      labelFont: "14px sans-serif",
      labelColor: "#ffffff",
      labelOutlineColor: "#0b1f33",
      labelOutlineWidth: 4,
      // 允许点击拾取，点击面时弹出属性框；不需要时改成 false
      pickable: true,
    },
    {
      label: "示例点位",
      value: "demo-markers",
      type: "markers",
      points: [
        { name: "示例点位 A", longitude: 116.12, latitude: 39.78 },
        { name: "示例点位 B", longitude: 116.82, latitude: 39.8 },
        { name: "示例点位 C", longitude: 116.02, latitude: 40.12 },
      ],
      pixelHeight: 32,
      modelUrl: "./models/demo-pin.glb",
    },
    // ---- 服务图层示例（地址留空 = 不出现在树上）----
    {
      label: "WMTS 示例",
      value: "demo-wmts",
      type: "wmts",
      url: "",
      layer: "demo",
      style: "default",
      tileMatrixSetID: "EPSG:3857",
      format: "image/png",
      maximumLevel: 18,
      levelOffset: 0,
      rectangle: [],
    },
    {
      label: "WFS 示例",
      value: "demo-wfs",
      type: "wfs",
      service: "demo",
      typeName: "",
      showLabel: true,
      labelField: "name",
    },
    {
      label: "3D Tiles 示例",
      value: "demo-3dtiles",
      type: "3dtiles",
      url: "",
      maximumScreenSpaceError: 16,
    },
    {
      label: "查询服务示例",
      value: "demo-query",
      type: "query",
      serverName: "",
      queryLayerName: "",
      nameField: "name",
      showLabel: true,
      fillColor: "#1f6feb",
      fillOpacity: 0.4,
      strokeColor: "#7cc4ff",
      strokeWidth: 1,
      pickable: false,
    },
  ],

  // 默认勾选的图层 value（空数组表示默认不上图；不写则回退到第一个可加载项）
  themeDefaults: ["demo-areas", "demo-markers"],

  // ------------------------------------------------------------
  // 地图服务地址（按需填写，留空则相关能力静默跳过）
  // ------------------------------------------------------------
  // 后端接口根地址（示例：https://example.com/api）
  apiRoot: "",
  // 静态资源根地址（示例：https://example.com）
  assetsRoot: "",
  // ArcGIS Server 根地址：WFS 走 <mapServerRoot>/services/<服务名>/MapServer/WFSServer
  mapServerRoot: "",
  // WFS 服务名表：{ 服务key: "服务名" }，供 themeOptions 的 wfs 条目引用
  mapServices: {},

  // 图例：<legendRoot>/styleInfo/<服务名>/<样式名>/<级号>/legend.json
  legendRoot: "",
  // 点图查询：<themeQueryRoot>/<服务名>/<图层名>/query?spatialFilter=<WKT>
  themeQueryRoot: "",

  // ------------------------------------------------------------
  // 属性弹窗字段白名单（英文名 → 中文名）
  // ------------------------------------------------------------
  // 只有表中收录的字段会展示；中文字段名原样展示。留空表示只展示中文字段。
  fieldLabels: {
    name: "名称",
    category: "类别",
    description: "说明",
    area_km2: "面积（km²）",
  },
};

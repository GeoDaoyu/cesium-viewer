/**
 * 运行时配置读取
 *
 * 所有环境相关的值都由 `public/config/app.js` 注入 `window.appcfg`，
 * 该脚本通过 `config/config.js` 的 headScripts 在应用代码之前同步加载，
 * 因此这里可以在模块初始化时直接读取。打包后直接改配置文件即可，
 * 不需要重新构建。
 *
 * 配置项的含义与结构见 `public/config/app.js` 的注释。
 */

const appcfg = (typeof window !== "undefined" && window.appcfg) || {};

/** 页面标题 / 副标题 */
export const APP_TITLE = appcfg.title || "Cesium Viewer";
export const APP_SUBTITLE = appcfg.subtitle || "";

/** 后端接口根地址 */
export const API_ROOT = appcfg.apiRoot || "";

/** 静态资源根地址 */
export const ASSETS_ROOT = appcfg.assetsRoot || "";

/** ArcGIS Server 根地址（WFS 由其拼出） */
export const MAP_SERVER_ROOT = appcfg.mapServerRoot || "";

/** WFS 服务名表：{ key: "服务名" } */
export const MAP_SERVICES = appcfg.mapServices || {};

/** 地图图例服务根地址 */
export const LEGEND_ROOT = appcfg.legendRoot || "";

/** 专题图点图查询根地址 */
export const THEME_QUERY_ROOT = appcfg.themeQueryRoot || "";

/** Cesium ION Token（可选，仅用于 ionAssetId 形式的 3D Tiles） */
export const CESIUM_ION_TOKEN = appcfg.cesiumIonToken || "";

/** 默认底图 */
export const BASEMAP = appcfg.basemap || {};

/** 可切换底图清单 */
export const BASEMAP_SERVICES = appcfg.basemapServices || [];

/** 默认底图（切换器第一项） */
export const DEFAULT_BASEMAP_SERVICE = BASEMAP_SERVICES[0] ?? null;

/** 三维地形配置 `{ url, requestVertexNormals, requestWaterMask }` */
export const TERRAIN = appcfg.terrain || {};

/**
 * 3D Tiles 加载后的整体抬升高度（米）
 *
 * 字段缺失 / 非法值按 5 处理；0 是有效值，不能被真值判断吞掉。
 */
const TILESET_HEIGHT_OFFSET_DEFAULT = 5;

const parseTilesetHeightOffset = (value) => {
  if (value === undefined || value === null || value === "") {
    return TILESET_HEIGHT_OFFSET_DEFAULT;
  }
  const offset = Number(value);
  return Number.isFinite(offset) ? offset : TILESET_HEIGHT_OFFSET_DEFAULT;
};

export const TILESET_HEIGHT_OFFSET = parseTilesetHeightOffset(
  appcfg.tilesetHeightOffset,
);

/** 专题图层树选项（数组，或按 tab 分组的对象） */
export const THEME_OPTIONS = appcfg.themeOptions || [];

/** 默认勾选的图层 value（数组） */
export const THEME_DEFAULTS = appcfg.themeDefaults || [];

/** 属性弹窗字段白名单：{ 英文字段名: 中文字段名 } */
export const FIELD_LABELS = appcfg.fieldLabels || {};

/** 忽略大小写的次级索引（各服务字段名大小写不统一） */
const FIELD_LABELS_LOWER = Object.entries(FIELD_LABELS).reduce(
  (acc, [en, cn]) => {
    const lower = en.toLowerCase();
    if (!(lower in acc)) acc[lower] = cn;
    return acc;
  },
  {},
);

/** 字段名本身是中文时直接展示 */
const CHINESE_FIELD_NAME = /[\u4e00-\u9fff]/;

/**
 * 取字段的显示名：英文 → 中文；未收录时原样返回
 * @param {string} name
 * @returns {string}
 */
export const fieldLabel = (name) => {
  if (name === null || name === undefined) return name;

  const key = String(name);
  return FIELD_LABELS[key] ?? FIELD_LABELS_LOWER[key.toLowerCase()] ?? key;
};

/**
 * 字段是否展示（白名单）
 *
 * 先精确匹配、再忽略大小写兜底；字段名本身是中文的直接展示。
 * 未收录的字段（OBJECTID / SHAPE 等）一律隐藏。
 *
 * @param {string} name
 * @returns {boolean}
 */
export const hasFieldLabel = (name) => {
  if (name === null || name === undefined) return false;

  const key = String(name);
  if (CHINESE_FIELD_NAME.test(key)) return true;

  const label = FIELD_LABELS[key] ?? FIELD_LABELS_LOWER[key.toLowerCase()];
  return label !== undefined && label !== null && String(label).trim() !== "";
};

/** 拼接后端接口地址 */
export const apiUrl = (path) => `${API_ROOT}${path}`;

/** 按 key 取静态资源地址 */
export const assetUrl = (key) => `${ASSETS_ROOT}${appcfg.assets?.[key] ?? ""}`;

/** 按 key 取 WFS 服务名 */
export const getServiceName = (key) => MAP_SERVICES[key] ?? "";

/**
 * WFS 服务地址
 * @param {string} key - mapServices 的 key
 */
export const wfsUrl = (key) =>
  `${MAP_SERVER_ROOT}/services/${encodeURIComponent(getServiceName(key))}/MapServer/WFSServer`;

/**
 * 图例接口地址
 *
 * `GET <legendRoot>/styleInfo/<serverName>/<styleId>/<level>/legend.json`
 * level 可省略（服务端返回按级号区间分组的结果）。
 */
export const legendUrl = (serverName, styleId = serverName, level) => {
  const levelPart =
    level === undefined || level === null || level === ""
      ? ""
      : `/${encodeURIComponent(level)}`;

  return `${LEGEND_ROOT}/styleInfo/${encodeURIComponent(serverName)}/${encodeURIComponent(styleId)}${levelPart}/legend.json`;
};

/** 专题要素查询的一层地址前缀 */
const themeLayerUrl = (serverName, layerName) => {
  if (!THEME_QUERY_ROOT || !serverName) return "";

  const root = THEME_QUERY_ROOT.replace(/\/+$/, "");
  const layer = layerName || serverName.toLowerCase();
  return `${root}/${encodeURIComponent(serverName)}/${encodeURIComponent(layer)}`;
};

/** 点图查询地址 */
export const themeQueryUrl = (serverName, layerName) => {
  const base = themeLayerUrl(serverName, layerName);
  return base ? `${base}/query` : "";
};

/** 要素计数地址（只回 count） */
export const themeCountUrl = (serverName, layerName) => {
  const base = themeLayerUrl(serverName, layerName);
  return base ? `${base}/count` : "";
};

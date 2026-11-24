import { themeCountUrl, themeQueryUrl } from "@/utils/appConfig";
import { buildClickPolygon } from "@/utils/clickQuery";
import { wktToGeoJson } from "@/utils/wkt";

/**
 * 地图服务要素查询
 *
 * 统一的查询接口（不同产品的路径前缀可能不同，由配置的 `themeQueryRoot` 决定）：
 *
 *   GET <themeQueryRoot>/<服务名>/<图层名>/query
 *       ?spatialFilter=<闭合面 WKT>&limit=1&withGeometry=true
 *
 * 返回体是扁平数组，一条要素一个对象；`withGeometry=true` 时几何放在 `shape`
 * 字段（WKT），本模块解析成 GeoJSON 并从属性里剔除，避免弹窗出现整段 WKT。
 *
 * 点图查询只取点击位置命中的那一条，**始终带 spatialFilter**：不传时服务端会
 * 返回整层数据（大图层可达几十 MB）。本文件还提供按属性过滤查询、要素计数、
 * 整层查询等入口。
 */

/** 点图查询一次只取一条；同一位置重叠多条时也只展示第一条 */
const QUERY_LIMIT = 1;

/**
 * 去掉服务端异常里的 Java 堆栈，只留第一行可读信息
 * @param {any} message
 * @returns {string}
 */
function cleanServerMessage(message) {
  const firstLine = String(message ?? "")
    .split("\n")[0]
    .trim();
  if (!firstLine) return "";

  return firstLine
    .replace(/^com\.northpool\.exception\.Message:\s*/, "")
    .replace(/^(?:java\.(?:lang|util)\.)?\w*(?:Exception|Error):\s*/, "");
}

/**
 * 从响应体里取要素数组
 *
 * 正式查询接口直接返回数组；`result` / `features` 等外层键作为兼容
 * （早期的 ime-cloud 查询服务返回 `{ status, totalCount, result }`）。
 *
 * @param {any} json
 * @returns {Array<any>|null} 无法识别时返回 null
 */
function extractFeatures(json) {
  if (Array.isArray(json)) return json;

  for (const key of ["result", "features", "data", "rows", "list", "records"]) {
    if (Array.isArray(json?.[key])) return json[key];
  }

  return null;
}

/**
 * 取要素的属性字段
 * @param {any} item
 * @returns {Record<string, any>}
 */
function toProperties(item) {
  if (!item || typeof item !== "object") return {};

  if (item.attributes && typeof item.attributes === "object") {
    return item.attributes;
  }
  if (item.properties && typeof item.properties === "object") {
    return item.properties;
  }

  return item;
}

/**
 * 原始要素数组 → `{ properties, geometry }`
 *
 * 服务端用 `shape` 返回 WKT（大小写以实际返回为准）；从属性里剔除，
 * 弹窗只展示业务字段，几何单独交给高亮图层。
 *
 * @param {Array<any>} features
 * @returns {Array<{properties: Record<string, any>, geometry: object|null}>}
 */
function parseFeatures(features) {
  return features.map((item) => {
    const properties = { ...toProperties(item) };

    const shapeKey = Object.keys(properties).find(
      (key) => key.toLowerCase() === "shape",
    );
    const shape = shapeKey ? properties[shapeKey] : null;
    if (shapeKey) delete properties[shapeKey];

    return {
      properties,
      geometry: typeof shape === "string" ? wktToGeoJson(shape) : null,
    };
  });
}

/**
 * 发一次查询请求并解析
 *
 * @param {string} url - `themeQueryUrl()` 拼出的查询地址
 * @param {string[]} queryParts - 已编码的查询参数
 * @param {object} [options]
 * @param {AbortSignal} [options.signal]
 * @param {Record<string, string>} [options.headers]
 * @returns {Promise<Array<{properties: Record<string, any>, geometry: object|null}>>}
 */
async function requestFeatures(url, queryParts, { signal, headers } = {}) {
  let response;
  try {
    response = await fetch(`${url}?${queryParts.join("&")}`, {
      signal,
      headers: { Accept: "application/json", ...headers },
    });
  } catch (error) {
    if (error.name === "AbortError") throw error;
    throw new Error("专题图查询服务不可达，请检查网络或服务地址");
  }

  let json = null;
  try {
    const text = await response.text();
    json = text ? JSON.parse(text) : null;
  } catch {
    throw new Error(`专题图查询返回的不是 JSON（HTTP ${response.status}）`);
  }

  if (!response.ok) {
    const detail = cleanServerMessage(json?.message);
    throw new Error(detail || `专题图查询失败（HTTP ${response.status}）`);
  }

  const features = extractFeatures(json);
  if (!features) {
    const detail = cleanServerMessage(json?.message);
    throw new Error(detail || "专题图查询返回结构不正确");
  }

  return parseFeatures(features);
}

/**
 * 按点位查询当前专题图要素
 *
 * @param {object} params
 * @param {string} params.serverName - 服务名称（如 demo_layer）
 * @param {string} params.layerName - 查询图层 id（通常为服务名的小写）
 * @param {number} params.lon - 经度（WGS84）
 * @param {number} params.lat - 纬度（WGS84）
 * @param {AbortSignal} [params.signal] - 取消信号
 * @param {Record<string, string>} [params.headers] - 额外请求头（服务端网直连不需要鉴权）
 * @returns {Promise<Array<{properties: Record<string, any>, geometry: object|null}>>}
 *   命中要素的属性对象 + 由 `shape` 字段解析出的 GeoJSON 几何
 */
export async function queryThemeFeaturesAtPoint({
  serverName,
  layerName,
  lon,
  lat,
  signal,
  headers,
}) {
  const url = themeQueryUrl(serverName, layerName);
  if (!url) {
    throw new Error("未配置专题图查询地址（themeQueryRoot）");
  }

  // WKT 里全是空格和括号，用 encodeURIComponent 编成 %20，
  // 避免 URLSearchParams 把空格编成 "+" 之后被服务端解错
  const query = [
    `spatialFilter=${encodeURIComponent(buildClickPolygon(lon, lat))}`,
    `limit=${QUERY_LIMIT}`,
    "withGeometry=true",
  ];

  return requestFeatures(url, query, { signal, headers });
}

/**
 * 按属性条件查询要素（不带 spatialFilter）
 *
 * 服务端支持 `filter` 参数，语法为 SQL 片段（如 `name='示例城市'`、
 * `name='示例镇' and parent='示例城市'`）。按名称定位要素时用它 ——
 * 这里**必须**始终带 filter，否则就是全表查询。
 *
 * @param {object} params
 * @param {string} params.serverName - 服务名称（如 demo_layer）
 * @param {string} params.layerName - 查询图层 id（通常为服务名的小写）
 * @param {string} params.filter - SQL 过滤片段，调用方负责转义引号
 * @param {number} [params.limit=5] - 最多返回条数；重名时调用方取首条
 * @param {AbortSignal} [params.signal] - 取消信号
 * @param {Record<string, string>} [params.headers] - 额外请求头
 * @returns {Promise<Array<{properties: Record<string, any>, geometry: object|null}>>}
 */
export async function queryThemeFeaturesByFilter({
  serverName,
  layerName,
  filter,
  limit = 5,
  signal,
  headers,
}) {
  const url = themeQueryUrl(serverName, layerName);
  if (!url) {
    throw new Error("未配置专题图查询地址（themeQueryRoot）");
  }
  if (!filter) {
    throw new Error("按名称查询要素必须提供 filter");
  }

  return requestFeatures(
    url,
    [
      `filter=${encodeURIComponent(filter)}`,
      `limit=${limit}`,
      "withGeometry=true",
    ],
    { signal, headers },
  );
}

/**
 * 取图层要素总数（只要数字，不要要素）
 *
 * `GET <themeQueryRoot>/<服务名>/<图层名>/count` → `{ "count": 2775 }`。
 * 服务端只跑一次 `count(*)`，返回体十几个字节；实测与分页拉全量求和的条数
 * 完全一致，而全量 `/query` 在大图层上会超时（子项目 21 万条 30s 都拿不下来）。
 *
 * 注意：`/count` 查的是**底表**，字段名比 `/query` 少且区分大小写
 * （如 `t_qyzz_ssdy` 里 `falx` / `objectid` 在，`xzqhmc` 不在）；
 * 要按条件计数时 `filter` / `spatialFilter` 都支持，但字段名得先确认。
 *
 * @param {object} params
 * @param {string} params.serverName - 服务名称（如 t_qyzz_ssdy）
 * @param {string} [params.layerName] - 图层名；省略时取服务名的小写
 * @param {AbortSignal} [params.signal] - 取消信号
 * @param {Record<string, string>} [params.headers] - 额外请求头
 * @returns {Promise<number>} 要素总数；服务不可达 / 响应异常时抛错
 */
export async function queryThemeFeatureCount({
  serverName,
  layerName,
  signal,
  headers,
}) {
  const url = themeCountUrl(serverName, layerName);
  if (!url) {
    throw new Error("未配置专题图查询地址（themeQueryRoot）");
  }

  let response;
  try {
    response = await fetch(url, {
      signal,
      headers: { Accept: "application/json", ...headers },
    });
  } catch (error) {
    if (error.name === "AbortError") throw error;
    throw new Error("专题图计数服务不可达，请检查网络或服务地址");
  }

  let json = null;
  try {
    const text = await response.text();
    json = text ? JSON.parse(text) : null;
  } catch {
    throw new Error(`专题图计数返回的不是 JSON（HTTP ${response.status}）`);
  }

  if (!response.ok) {
    const detail = cleanServerMessage(json?.message);
    throw new Error(detail || `专题图计数失败（HTTP ${response.status}）`);
  }

  const count = Number(json?.count);
  if (!Number.isFinite(count)) {
    const detail = cleanServerMessage(json?.message);
    throw new Error(detail || "专题图计数返回结构不正确");
  }

  return count;
}

/**
 * 查询整个图层的要素（带几何）
 *
 * `GET <themeQueryRoot>/<服务名>/<图层名>/query?limit=500&withGeometry=true`
 *
 * 给「要素不多、但需要把整层 WKT 取回前端按矢量渲染」的图层用 —— 目前只有
 * 示例（`demo_layer`）。**不要**拿它拉要素非常多的大图层
 * （几十万条、上百 MB），那些只能按 `spatialFilter` 单点查，或走 `/count` 只取数。
 *
 * 返回体与点图查询同构（扁平数组，几何在 `shape` 字段的 WKT 里），解析复用
 * `requestFeatures()`：`shape` 会被解析成 GeoJSON 几何、并从属性里剔除。
 *
 * @param {object} params
 * @param {string} params.serverName - 服务名称（如 demo_layer）
 * @param {string} [params.layerName] - 查询图层 id；省略时取服务名的小写（与点图查询
 *   的默认值一致）。区域面服务的图层名恰好与服务名相同（`demo_layer`）
 * @param {string} [params.filter] - 可选的属性过滤（SQL 片段）
 * @param {number} [params.limit=500] - 一次最多取多少要素
 * @param {boolean} [params.withGeometry=true] - 是否带上 `shape`（WKT）
 * @param {AbortSignal} [params.signal] - 取消信号
 * @param {Record<string, string>} [params.headers] - 额外请求头
 * @returns {Promise<Array<{properties: Record<string, any>, geometry: object|null}>>}
 */
export async function queryThemeLayerFeatures({
  serverName,
  layerName,
  filter,
  limit = 500,
  withGeometry = true,
  signal,
  headers,
}) {
  const url = themeQueryUrl(serverName, layerName);
  if (!url) {
    throw new Error("未配置专题图查询地址（themeQueryRoot）");
  }

  const query = [
    `limit=${limit}`,
    `withGeometry=${withGeometry ? "true" : "false"}`,
  ];
  if (filter) query.push(`filter=${encodeURIComponent(filter)}`);

  return requestFeatures(url, query, { signal, headers });
}

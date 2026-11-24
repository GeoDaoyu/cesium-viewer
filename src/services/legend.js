/**
 * 地图图例接口
 *
 * 图例由地图服务按「服务名 + 样式名 + 级号」给出，不再从
 * `public/config/themeOptions.<环境>.js` 里手写。接口文档：
 *
 *   GET <legendRoot>/styleInfo/{serverName}/{styleId}/{level}/legend.json
 *   serverName  服务名称（如 demo_layer）
 *   styleId     样式名称（多数服务与服务名相同）
 *   level       地图层级，可省略
 *
 * 这里只负责请求与按 `serverName/styleId` 缓存原始 JSON；解析成可渲染条目
 * 由 `@/utils/legend` 的 `parseLegend()` 负责（同一份结果可随地图级号切换区间）。
 *
 * 注意：图例接口属于地图服务网关（`legendRoot`），不是业务后端 `apiRoot`，
 * 因此不复用后端接口的请求封装。
 */
import { legendUrl } from "@/utils/appConfig";

/** serverName/styleId → Promise<JSON>，同一图层的图例只请求一次 */
const cache = new Map();

/**
 * 请求图层图例
 *
 * @param {object} source
 * @param {string} source.serverName - 服务名称
 * @param {string} [source.styleId=source.serverName] - 样式名称
 * @param {number|string} [source.level] - 指定层级；通常省略，由解析侧按当前缩放选区间
 * @returns {Promise<object|Array|null>} 接口 JSON（失败时 reject）
 */
export async function fetchLegend({
  serverName,
  styleId = serverName,
  level,
} = {}) {
  if (!serverName) return null;

  const effectiveStyleId = styleId || serverName;
  const key = `${serverName}/${effectiveStyleId}/${level ?? ""}`;
  if (cache.has(key)) return cache.get(key);

  const promise = fetch(legendUrl(serverName, effectiveStyleId, level), {
    headers: { Accept: "application/json" },
  })
    .then(async (response) => {
      if (!response.ok) {
        // 服务端出错时会返回 { status, message }，把 message 带进错误里便于排查
        let detail = "";
        try {
          const body = await response.json();
          if (body?.message) detail = `：${body.message}`;
        } catch {
          // 响应不是 JSON 时忽略，保留状态码即可
        }
        throw new Error(`图例请求失败（HTTP ${response.status}）${detail}`);
      }

      const text = await response.text();
      return text ? JSON.parse(text) : null;
    })
    .catch((error) => {
      // 失败不缓存，下次切换图层时还能重试
      cache.delete(key);
      throw error;
    });

  cache.set(key, promise);
  return promise;
}

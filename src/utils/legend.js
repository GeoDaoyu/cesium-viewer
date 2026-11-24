/**
 * 图例接口结果解析
 *
 * 图例来自地图服务（不是业务后端），接口：
 *   GET <legendRoot>/styleInfo/{serverName}/{styleId}/{level}/legend.json
 *
 * 返回有两种形态（level 省略时是前者）：
 *
 * ```jsonc
 * // 1) 按服务级号区间分组
 * { "7-15": { "legends": [...], "textureMap": {} } }
 *
 * // 2) 指定 level 时直接给一组
 * { "legends": [...], "textureMap": {} }
 * ```
 *
 * `legends` 是一个扁平数组，用 `pid` 表达父子关系：
 * - 父项（无 `pid`）：图层样式本身，`name` 多数是服务 / 样式名；
 * - 子项（`pid` 指向父项 `id`）：真正的分级 / 分类图例，`name` 才是给人看的标签。
 *
 * 父项有子项时只展示子项；没有子项时父项自己就是一条图例（单分类图层），
 * 此时若 `name` 只是服务名（如 `demo_layer`），改用图层显示名，避免图例里出现英文代号。
 */

const EARTH_CIRCUMFERENCE = 2 * Math.PI * 6378137;

/**
 * 估算当前相机对应的 Cesium 瓦片级号
 *
 * 用相机高度、垂直视场角与画布高度反推地面分辨率，再换算成
 * `GeographicTilingScheme` 的级号（第 L 级的瓦片跨度为 180 / 2^L 度）。
 * 只用于挑选图例接口返回的级号区间，不需要很精确。
 *
 * @param {object} viewer - Cesium.Viewer 实例
 * @returns {number|null} 级号；viewer 不可用时返回 null
 */
export function getMapLevel(viewer) {
  if (!viewer || viewer.isDestroyed?.()) return null;

  const height = viewer.camera?.positionCartographic?.height;
  const fovy = viewer.camera?.frustum?.fovy;
  const viewportHeight = viewer.canvas?.clientHeight;

  if (!(height > 0) || !fovy || !viewportHeight) return null;

  // 垂直视场内的地面高度（m） / 画布高度（px） = 地面分辨率（m/px）
  const resolution = (2 * height * Math.tan(fovy / 2)) / viewportHeight;
  if (!(resolution > 0)) return null;

  // 第 L 级横向像素数 = 2 * 2^L * 256
  const level = Math.log2(EARTH_CIRCUMFERENCE / (512 * resolution));
  return Math.max(0, Math.round(level));
}

/** "7-15" → { min: 7, max: 15 }；"19" → { min: 19, max: 19 } */
function parseLevelRange(key) {
  const matched = /^\s*(\d+)(?:\s*-\s*(\d+))?\s*$/.exec(String(key));
  if (!matched) return null;

  const min = Number(matched[1]);
  const max = matched[2] === undefined ? min : Number(matched[2]);
  return { min, max };
}

/** 从接口返回里挑出与当前级号匹配的那一组 */
function selectLegendSet(payload, level) {
  if (!payload) return null;
  if (Array.isArray(payload)) return { legends: payload };
  if (Array.isArray(payload.legends)) return payload;
  if (typeof payload !== "object") return null;

  const sets = Object.entries(payload)
    .filter(([, value]) => value && Array.isArray(value.legends))
    .map(([key, value]) => ({ key, value, range: parseLevelRange(key) }));

  if (sets.length === 0) return null;
  if (level === undefined || level === null) return sets[0].value;

  const containing = sets.find(
    ({ range }) => range && level >= range.min && level <= range.max,
  );
  if (containing) return containing.value;

  // 级号落在所有区间之外（例如相机比服务最大级还近）：取距离最近的一组
  let nearest = null;
  for (const set of sets) {
    if (!set.range) continue;
    const distance =
      level < set.range.min
        ? set.range.min - level
        : level > set.range.max
          ? level - set.range.max
          : 0;

    if (!nearest || distance < nearest.distance) {
      nearest = { value: set.value, distance };
    }
  }

  return (nearest || sets[0]).value;
}

/** 取图例项的代表色（面 / 线 / 点样式字段不同） */
function getItemColor(item) {
  const style = Array.isArray(item?.style) ? item.style[0] : item?.style;
  if (!style) return null;

  return (
    style.fillColor ||
    style.strokeColor ||
    style.pointFillStyle ||
    style.lineColor ||
    null
  );
}

/**
 * 判断图例项的名字是不是「服务 / 样式代号」而不是业务标签
 *
 * 单分类图层的父项 `name` 往往等于 `layerId` / 服务名（如 `demo_layer`），
 * 这类名字不适合直接展示，调用方会用图层显示名兜底。
 */
function isRawStyleName(name, item, serverName, styleId) {
  if (!name) return true;

  const target = String(name).toLowerCase();
  return [item.layerId, serverName, styleId]
    .filter(Boolean)
    .some((candidate) => String(candidate).toLowerCase() === target);
}

/**
 * 把图例接口返回解析成可直接渲染的条目
 *
 * @param {object|Array|null} payload - 接口 JSON
 * @param {object} [options]
 * @param {number|null} [options.level] - 当前服务级号，用于挑选级号区间；空则取第一组
 * @param {string} [options.layerName] - mapStore 里的图层显示名，代号兜底用
 * @param {string} [options.serverName] - 服务名，判断代号用
 * @param {string} [options.styleId] - 样式名，判断代号用
 * @returns {{ items: Array<{
 *   key: string, label: string, color: string|null, icon: string|null
 * }> }}
 */
export function parseLegend(
  payload,
  { level = null, layerName = "", serverName = "", styleId = "" } = {},
) {
  const set = selectLegendSet(payload, level);
  const legends = set?.legends;

  if (!Array.isArray(legends) || legends.length === 0) {
    return { items: [] };
  }

  // 注记图层（type: "label"）没有可展示的色块，也不属于专题分级，跳过
  const drawable = legends.filter((item) => item && item.type !== "label");

  const parents = drawable.filter((item) => !item.pid);
  const childrenByParent = new Map();
  for (const item of drawable) {
    if (!item.pid) continue;
    if (!childrenByParent.has(item.pid)) {
      childrenByParent.set(item.pid, []);
    }
    childrenByParent.get(item.pid).push(item);
  }

  // 有子项时只取子项；没有子项时父项自己就是一条图例。
  // 父项可能不在返回里（理论上不会），把这类孤儿子项也收进来，避免整组丢失。
  const picked = [];
  const seen = new Set();
  const push = (item) => {
    const key = item.id || `${picked.length}-${item.name ?? ""}`;
    if (seen.has(key)) return;
    seen.add(key);
    picked.push(item);
  };

  for (const parent of parents) {
    const children = childrenByParent.get(parent.id);
    if (children?.length) {
      children.forEach(push);
    } else {
      push(parent);
    }
  }

  const parentIds = new Set(parents.map((parent) => parent.id));
  for (const [pid, children] of childrenByParent) {
    if (!parentIds.has(pid)) children.forEach(push);
  }

  const items = picked.map((item) => {
    const fallback = layerName || "图例";
    const label =
      item.name && !isRawStyleName(item.name, item, serverName, styleId)
        ? item.name
        : fallback;

    return {
      key: item.id || `${item.name ?? "legend"}-${label}`,
      label,
      color: getItemColor(item),
      icon: item.ico || null,
    };
  });

  return { items };
}

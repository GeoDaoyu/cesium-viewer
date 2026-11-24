import { useCesiumStore, useMapStore } from "@/stores";
import { clearEntityHighlight } from "@/utils/highlight";

/**
 * 一次性高亮数据源的固定名称 + 统一清除
 *
 * 一次性高亮都是临时叠加：不进 mapStore、不出图例、不参与点图查询，由各自的
 * 模块 / 组件在选中时画、取消时摘。地图上可能同时存在好几份，工具栏的
 * 「清除高亮」要一次全摘掉。
 *
 * Cesium 的 DataSource 没有 id 字段，但 `name` 会原样保留，所以每个高亮数据源
 * 都从 HIGHLIGHT_LAYER_NAMES 取固定 name，清除时按这些 name 遍历摘除。
 * **新增一次性高亮时，把它的 name 加进这里**，否则清除按钮扫不到。
 *
 * 光扫数据源不够：各高亮还持有自己的引用和 UI 状态，而且可能有在途请求
 * （查询还没回来，清除后回调又把高亮画回来）。所以高亮方在
 * `registerHighlightClearer` 登记清理回调，清除时先逐个调回调、再扫一遍兜底，
 * 最后恢复实体自身样式并关掉属性弹窗。
 */

/** 各一次性高亮数据源的固定名称（清除按钮按它们识别） */
export const HIGHLIGHT_LAYER_NAMES = Object.freeze({
  /** 通用一次性高亮（面 / 线 / 点覆盖层） */
  HIGHLIGHT: "one-shot-highlight",
  /** 面中心的标注点 */
  MARKER: "one-shot-marker",
  /** 点图查询命中的要素 */
  THEME_QUERY: "theme-query-highlight",
});

const HIGHLIGHT_LAYER_SET = new Set(Object.values(HIGHLIGHT_LAYER_NAMES));

/** 各高亮登记的清理回调（取消在途请求 + 摘图层 + 复位内部状态） */
const clearers = new Set();

/**
 * 登记一个「清除自己的高亮」回调
 *
 * @param {(viewer?: Cesium.Viewer) => void} clearer - 无返回值；实现方负责摘掉自己
 *   画的图层、让在途请求作废、复位内部引用 / 面板选中态
 * @returns {() => void} 取消登记（组件卸载时调用）
 */
export function registerHighlightClearer(clearer) {
  if (typeof clearer !== "function") return () => {};

  clearers.add(clearer);
  return () => clearers.delete(clearer);
}

/**
 * 是否为一次性高亮数据源（按固定 name 判断）
 *
 * @param {Cesium.DataSource} dataSource - 数据源
 * @returns {boolean}
 */
export function isHighlightLayer(dataSource) {
  return HIGHLIGHT_LAYER_SET.has(dataSource?.name);
}

/**
 * 兜底：把 viewer 上残留的高亮数据源按固定 name 全部摘掉
 *
 * 覆盖「组件已卸载但忘记清理」「高亮没登记 clearer」等情况。倒序遍历，删除时
 * 不影响未处理的索引。只摘不销毁：高亮是内存里的小数据源，交给 GC 即可，
 * 避免外部还持有引用时访问到已销毁对象。
 *
 * @param {Cesium.Viewer} [viewer] - Cesium Viewer 实例（已销毁也安全）
 */
function removeHighlightLayers(viewer) {
  if (!viewer || viewer.isDestroyed()) return;

  const dataSources = viewer.dataSources;
  for (let i = dataSources.length - 1; i >= 0; i--) {
    const dataSource = dataSources.get(i);
    if (isHighlightLayer(dataSource)) {
      dataSources.remove(dataSource);
    }
  }
}

/**
 * 清除地图上的全部高亮
 *
 * 顺序很重要：
 * 1. 先调各高亮登记的清理回调 —— 取消在途查询（否则查询回来又会把高亮画上）、
 *    摘图层、复位面板选中态；
 * 2. 再按固定 name 扫一遍兜底；
 * 3. 恢复点击实体时改的实体自身样式（它不是独立数据源，扫不到）；
 * 4. 关掉属性弹窗（专题图点图查询 / 实体点击的 popup）。
 *
 * @param {Cesium.Viewer} [viewer] - 省略时取当前 viewer
 */
export function clearAllHighlights(viewer) {
  const target = viewer ?? useCesiumStore.getState().viewer;

  for (const clearer of [...clearers]) {
    try {
      clearer(target);
    } catch (error) {
      console.warn("[高亮] 清理失败:", error);
    }
  }

  removeHighlightLayers(target);
  clearEntityHighlight();
  useMapStore.getState().clearSelection();
}

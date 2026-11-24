import { useMemo } from "react";
import { useMapStore } from "@/stores";
import { THEME_QUERY_ROOT } from "@/utils/appConfig";
import usePointQuery from "./usePointQuery";

/**
 * 点图查询
 *
 * 查询源来自 `ThemeSwitcher` 登记到 mapStore 图层的 `querySource`
 * （服务名 + 查询图层名）：layers 按加载顺序排列，后加载的在上层，
 * 所以倒序排成「上层 → 下层」的数组交给 `usePointQuery()`，
 * 点击时由上到下逐个试、命中即停。
 *
 * WFS / GeoJSON 条目没有 querySource，不会进入点图查询；未配置
 * `themeQueryRoot` 时整体跳过。
 */
export default function PointQuery() {
  const layers = useMapStore((s) => s.layers);

  const sources = useMemo(() => {
    // 未配置时没有配置查询根地址（专题图都是 WFS，要素直接点击），整体跳过
    if (!THEME_QUERY_ROOT) return [];

    const result = [];
    for (let i = layers.length - 1; i >= 0; i--) {
      const layer = layers[i];
      if (!layer.visible || !layer.querySource?.serverName) continue;

      result.push({
        ...layer.querySource,
        title: layer.legendTitle || layer.name || layer.querySource.serverName,
      });
    }
    return result;
  }, [layers]);

  usePointQuery(sources);

  return null;
}

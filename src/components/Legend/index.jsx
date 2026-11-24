import { useEffect, useMemo, useState } from "react";
import { useCesiumStore, useMapStore } from "@/stores";
import { fetchLegend } from "@/services/legend";
import { getMapLevel, parseLegend } from "@/utils/legend";
import styles from "./index.less";

/**
 * 图例面板
 *
 * 数据来自地图服务的图例接口（不是前端配置、也不是业务后端）：
 *
 *   GET <legendRoot>/styleInfo/{serverName}/{styleId}/{level}/legend.json
 *
 * 流程：
 * 1. ThemeSwitcher 加载 WMTS 专题图时，把 `serverName` / `styleId` 登记到
 *    mapStore 图层的 `legendSource`；
 * 2. 本组件按 `legendSource` 请求图例（`services/legend` 里按服务 + 样式缓存）；
 * 3. 接口返回的是扁平数组，用 `pid` 表达父子关系，`utils/legend` 解析成
 *    「父项有子项取子项、无子项取父项」的条目；
 * 4. 接口可返回多个级号区间（如 `7-11` / `12-14`），按当前相机级号挑一组。
 *
 * WFS 图层没有 `legendSource`，不参与图例。
 */
export default function Legend() {
  const layers = useMapStore((s) => s.layers);
  const viewer = useCesiumStore((s) => s.viewer);
  const cameraHeight = useCesiumStore((s) => s.cameraPosition?.height);

  const legendLayers = useMemo(
    () =>
      layers.filter((layer) => layer.visible && layer.legendSource?.serverName),
    [layers],
  );

  // 请求只跟「图层 ID + 服务名 + 样式名」有关；缩放 / 显示名变化不重新发请求
  const sourceKey = useMemo(
    () =>
      legendLayers
        .map((layer) => {
          const { serverName, styleId } = layer.legendSource;
          return `${layer.id}|${serverName}|${styleId || serverName}`;
        })
        .join("~"),
    [legendLayers],
  );

  /** 图层 ID → { status: "loading" | "ready" | "error", payload?, error? } */
  const [entries, setEntries] = useState({});

  useEffect(() => {
    if (!sourceKey) {
      setEntries({});
      return undefined;
    }

    let cancelled = false;
    setEntries(
      Object.fromEntries(
        legendLayers.map((layer) => [layer.id, { status: "loading" }]),
      ),
    );

    Promise.all(
      legendLayers.map(async (layer) => {
        try {
          const payload = await fetchLegend(layer.legendSource);
          return [layer.id, { status: "ready", payload }];
        } catch (error) {
          return [layer.id, { status: "error", error }];
        }
      }),
    ).then((pairs) => {
      if (cancelled) return;
      setEntries(Object.fromEntries(pairs));
    });

    return () => {
      cancelled = true;
    };
    // sourceKey 已覆盖 legendLayers 里请求相关的全部字段；legendLayers 的变化
    // 必然导致 sourceKey 变化（可见性 / 图层增删 / 服务名 / 样式名）。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceKey]);

  // 相机高度变化会触发重渲染，用于把「Cesium 级号 + 配置偏移」换算成服务级号
  const mapLevel = useMemo(
    () => getMapLevel(viewer),
    // cameraHeight 只用于触发重算，不参与计算
    [viewer, cameraHeight],
  );

  return (
    <div className={styles.legend}>
      <header className={styles.header}>
        <span className={styles.title}>图例</span>
      </header>
      <div className={styles.content}>
        {legendLayers.length === 0 ? (
          <p className={styles.placeholder}>暂无图例</p>
        ) : (
          <ul className={styles.list}>
            {legendLayers.map((layer) => {
              const entry = entries[layer.id];
              const title = layer.legendTitle || layer.name;

              const level =
                mapLevel === null
                  ? null
                  : mapLevel + (Number(layer.legendSource.levelOffset) || 0);

              const items =
                entry?.status === "ready"
                  ? parseLegend(entry.payload, {
                      level,
                      layerName: title,
                      serverName: layer.legendSource.serverName,
                      styleId: layer.legendSource.styleId,
                    }).items
                  : [];

              // 单分类图层只有一条图例、且标签就是组标题时，不再重复显示标题
              const single = items.length === 1 && items[0].label === title;

              return (
                <li key={layer.id} className={styles.layerGroup}>
                  {!single && (
                    <div className={styles.groupHeader}>
                      <span className={styles.layerName}>{title}</span>
                    </div>
                  )}

                  {!entry || entry.status === "loading" ? (
                    <p className={styles.placeholder}>图例加载中…</p>
                  ) : entry.status === "error" ? (
                    <p
                      className={styles.placeholder}
                      title={entry.error?.message}
                    >
                      图例加载失败
                    </p>
                  ) : items.length === 0 ? (
                    <p className={styles.placeholder}>暂无图例</p>
                  ) : (
                    <ul className={styles.itemList}>
                      {items.map((item) => (
                        <li key={item.key} className={styles.item}>
                          {item.icon ? (
                            <img
                              className={styles.legendImage}
                              src={item.icon}
                              alt=""
                            />
                          ) : (
                            <span
                              className={styles.colorBlock}
                              style={{
                                backgroundColor: item.color || "#888",
                              }}
                            />
                          )}
                          <span className={styles.label}>{item.label}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

import { TreeSelect } from "antd";
import * as Cesium from "cesium";
import {
  useState,
  useMemo,
  useEffect,
  useLayoutEffect,
  useRef,
  useCallback,
} from "react";
import { useCesiumStore, useMapStore } from "@/stores";
import { THEME_DEFAULTS, THEME_OPTIONS } from "@/utils/appConfig";
import {
  addThemeLayer,
  canLoadThemeOption,
  removeThemeLayer,
} from "@/utils/layers/themeLayer";
import { flyToBoundingSphere } from "@/utils/camera";
import {
  buildThemeTree,
  flattenThemeOptions,
  resolveDefaultValues,
} from "./tree";
import styles from "./index.less";

/**
 * 专题图层切换器（树形多选）
 *
 * 选项由 `public/config/app.js` 的 `themeOptions` 驱动：勾选一个叶子就加载
 * 一张图层，取消勾选即摘除，可以同时勾选多个。`group` / `year` / `children`
 * 只用于搭树，不参与加载；具体的加载方式（WFS / WMTS / GeoJSON / 标注点 /
 * 3D Tiles）由条目的 `type` 决定，见 `src/utils/layers/themeLayer.js`。
 *
 * 每个条目的默认勾选值来自 `themeDefaults`；没有配置或全部匹配不上时，
 * 回退到第一个可加载项，保证地图不会空着。
 *
 * 注意：配置条目不能原样交给 antd TreeSelect —— WMTS 的 `style` 是样式名，
 * antd 会把它当成 CSS 样式展开，导致整页白屏。树节点只保留
 * title / value / children（见 `./tree`）。
 *
 * WMTS 条目会把 `serverName` / `styleId` 登记到 mapStore 图层的
 * `legendSource`（图例），把 `querySource` 登记给 PointQuery 做点图查询。
 * 前端配色的 GeoJSON / 查询服务图层不登记这两项：图例来自服务端样式，
 * 且铺满区域的参考底图不应抢占点图查询。
 */
/** 递归过滤掉不可加载的叶子（分组里没有可加载子项时整组消失） */
function filterLoadable(list = []) {
  return list
    .map((option) =>
      option?.children?.length
        ? { ...option, children: filterLoadable(option.children) }
        : option,
    )
    .filter((option) =>
      option?.children
        ? option.children.length > 0
        : canLoadThemeOption(option),
    );
}

export default function ThemeSwitcher() {
  const viewer = useCesiumStore((s) => s.viewer);
  const ready = useCesiumStore((s) => s.ready);
  const addLayer = useMapStore((s) => s.addLayer);
  const removeLayer = useMapStore((s) => s.removeLayer);

  const options = useMemo(
    () =>
      Array.isArray(THEME_OPTIONS)
        ? THEME_OPTIONS
        : THEME_OPTIONS.default || [],
    [],
  );
  // 只把可加载的条目放进树：配置里地址留空的服务示例不显示，填好地址后自动出现
  const treeData = useMemo(
    () => buildThemeTree(filterLoadable(options)),
    [options],
  );
  const leafOptions = useMemo(() => flattenThemeOptions(options), [options]);

  const defaultValues = useMemo(() => {
    const configured = Array.isArray(THEME_DEFAULTS)
      ? THEME_DEFAULTS
      : THEME_DEFAULTS.default;

    if (Array.isArray(configured)) {
      const resolved = resolveDefaultValues(leafOptions, configured);
      // 显式空数组 = 默认不上图；非空配置却都没匹配上时回退到第一个可加载项
      if (resolved.length > 0 || configured.length === 0) return resolved;
    }

    const first = leafOptions.find(
      (option) => option?.value && canLoadThemeOption(option),
    );
    return first ? [first.value] : [];
  }, [leafOptions]);

  const [selected, setSelected] = useState(defaultValues);

  // leafOptions 变化（异步配置 / 热更新）时重新落到默认值
  useEffect(() => {
    setSelected(defaultValues);
  }, [defaultValues]);

  /** 已加载图层：value → { handle, storeId, viewer } */
  const layersRef = useRef(new Map());
  /** 正在加载的图层：value → viewer */
  const pendingRef = useRef(new Map());
  /** 最新勾选值：异步加载完成后据此判断是否已被取消 */
  const selectedRef = useRef(selected);
  const mountedRef = useRef(true);

  useLayoutEffect(() => {
    selectedRef.current = selected;
  }, [selected]);

  const handleChange = (values) => {
    setSelected(Array.isArray(values) ? values : []);
  };

  /** 摘除一个已加载图层（Cesium 图层 + mapStore 注册） */
  const removeEntry = useCallback(
    (value) => {
      const entry = layersRef.current.get(value);
      if (!entry) return;

      layersRef.current.delete(value);
      removeThemeLayer(entry.viewer, entry.handle);
      removeLayer(entry.storeId);
    },
    [removeLayer],
  );

  // 勾选值 / viewer / 选项变化时做图层 diff：取消的摘掉，新增的加载
  useEffect(() => {
    if (!ready || !viewer || viewer.isDestroyed()) return;

    const selectedSet = new Set(selected);
    const optionMap = new Map();
    for (const option of leafOptions) {
      if (option?.value) optionMap.set(option.value, option);
    }

    // 1. 摘掉取消勾选的；viewer 重建后旧 viewer 上的图层也一并摘掉
    for (const [value, entry] of [...layersRef.current]) {
      if (entry.viewer !== viewer || !selectedSet.has(value)) {
        removeEntry(value);
      }
    }

    // 2. 新勾选的逐项加载（已在加载中的跳过）
    const locateLoads = [];

    for (const value of selected) {
      if (layersRef.current.has(value)) continue;
      if (pendingRef.current.get(value) === viewer) continue;

      const option = optionMap.get(value);
      if (!option || !canLoadThemeOption(option)) continue;

      pendingRef.current.set(value, viewer);

      const loadPromise = (async () => {
        try {
          const handle = await addThemeLayer(viewer, option);
          if (!handle) return;

          // 加载期间取消勾选 / viewer 重建：丢弃，不注册
          const stillSelected = selectedRef.current.includes(value);
          const viewerAlive =
            !viewer.isDestroyed() &&
            useCesiumStore.getState().viewer === viewer;

          if (!mountedRef.current || !stillSelected || !viewerAlive) {
            removeThemeLayer(viewer, handle);
            return;
          }

          // 极端情况下同一 value 已注册：先摘掉旧的，避免 mapStore 重复 ID
          removeEntry(value);

          const storeId = option.layerId
            ? `${option.layerId}:${option.value}`
            : `theme:${option.value}`;

          addLayer({
            id: storeId,
            name: option.layerName || option.label || option.value,
            legendTitle: option.label || option.layerName || option.value,
            type: handle.type,
            visible: true,
            hoverFields: option.hoverFields || null,
            // 图例只对服务端出图的 WMTS 有意义
            legendSource:
              handle.type === "wmts" && option.serverName
                ? {
                    serverName: option.serverName,
                    styleId: option.styleId || option.serverName,
                    levelOffset: Number(option.levelOffset) || 0,
                  }
                : null,
            // 点图查询只给 WMTS 登记；参考底图（GeoJSON 等）不能抢查询
            querySource:
              handle.type === "wmts" && option.serverName
                ? {
                    serverName: option.serverName,
                    layerName:
                      option.queryLayerName || option.serverName.toLowerCase(),
                  }
                : null,
          });

          layersRef.current.set(value, { handle, storeId, viewer });
        } catch (err) {
          console.error("[ThemeSwitcher] 图层加载失败:", err);
        } finally {
          if (pendingRef.current.get(value) === viewer) {
            pendingRef.current.delete(value);
          }
        }
      })();

      if (option.locateOnLoad) locateLoads.push(loadPromise);
    }

    // 3. 带 locateOnLoad 的图层（通常是 3D Tiles）加载完后按合并包围球飞一次
    if (locateLoads.length) {
      Promise.all(locateLoads).then(() => {
        if (!mountedRef.current || viewer.isDestroyed()) return;

        const spheres = selectedRef.current
          .filter((value) => optionMap.get(value)?.locateOnLoad)
          .map((value) => layersRef.current.get(value))
          .filter((entry) => entry?.viewer === viewer)
          .map((entry) => entry.handle?.layer?.boundingSphere)
          .filter(Boolean);

        if (!spheres.length) return;

        const sphere =
          spheres.length === 1
            ? spheres[0]
            : Cesium.BoundingSphere.fromBoundingSpheres(spheres);

        flyToBoundingSphere(viewer, sphere);
      });
    }
  }, [ready, viewer, selected, leafOptions, addLayer, removeEntry]);

  // 卸载时摘掉全部图层
  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;

      for (const entry of layersRef.current.values()) {
        removeThemeLayer(entry.viewer, entry.handle);
        removeLayer(entry.storeId);
      }
      layersRef.current.clear();
      pendingRef.current.clear();
    };
  }, [removeLayer]);

  if (treeData.length === 0) return null;

  return (
    <div className={styles.wrapper}>
      <TreeSelect
        className={styles.themeTree}
        value={selected}
        onChange={handleChange}
        treeData={treeData}
        treeCheckable
        showCheckedStrategy={TreeSelect.SHOW_CHILD}
        treeDefaultExpandAll
        listHeight={440}
        treeTitleRender={(node) =>
          node.children ? (
            <span className={styles.groupTitle}>{node.title}</span>
          ) : (
            node.title
          )
        }
        maxTagCount={1}
        maxTagPlaceholder={(omitted) => `+${omitted.length}`}
        placeholder="选择图层"
        aria-label="图层"
        suffixIcon={<span className={styles.selectArrow}>▾</span>}
        classNames={{ popup: { root: "themeSwitcherPopup" } }}
      />
    </div>
  );
}

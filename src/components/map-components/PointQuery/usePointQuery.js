import { useCallback, useEffect, useRef } from "react";
import * as Cesium from "cesium";
import { useCesiumStore, useMapStore } from "@/stores";
import { queryThemeFeaturesAtPoint } from "@/services/themeQuery";
import { pickLonLat } from "@/utils/clickQuery";
import { pickEntity, pickModelFeature } from "@/utils/pick";
import { addGeoJsonLayer, removeGeoJsonLayer } from "@/utils/layers";
import {
  HIGHLIGHT_LAYER_NAMES,
  registerHighlightClearer,
} from "@/utils/highlights";

/**
 * 点图查询交互
 *
 * 点击地图 → 取当前可查询的 WMTS 图层（从上层到下层）→ 用点击点构造闭合小矩形
 * → 逐层请求要素查询 → 第一个命中的要素交给属性弹窗，并用返回的 `shape`（WKT）
 * 画一份红色高亮。
 *
 * 查询源由调用方解析后传入，数组顺序就是叠放顺序（最上层在前）。单层请求失败
 * 只记日志、继续查下一层，不让一个坏服务把整次点击吞掉。
 *
 * 点击到 Cesium 实体或 3D Tiles 模型时直接跳过，交给各自的点击逻辑；高亮覆盖层
 * 标记为不参与拾取，点击会穿透到下面的业务图层。
 */
const HIGHLIGHT_LAYER_NAME = HIGHLIGHT_LAYER_NAMES.THEME_QUERY;

/**
 * 高亮样式与示例页面的选中高亮同款：红色半透明面 + 实线边框；
 * `height` 抬 50m 避免与地表 / WMTS 影像产生 z-fighting。
 * 专题图目前都是面，万一点要素时图钉也用红色。
 */
const HIGHLIGHT_OPTION = {
  defaultColor: "#ff3b30",
  fillOpacity: 0.5,
  height: 50,
  markerColor: "#ff3b30",
  markerSize: 32,
};

/**
 * 按顺序逐个图层查询，返回第一个命中的结果
 *
 * 「从上到下」：调用方给的数组已按屏幕叠放顺序排好（最上层在前），
 * 每一层用同一个点击点的小矩形查一次，命中即停 —— 这样叠在上面的
 * 小范围图层（如重点项目）没盖住点击点时，还能落到下面的全图图层。
 *
 * 单个图层查询失败（服务 404 / 网络抖动）只记日志并继续查下一层，
 * 不让一个坏服务把整次点击吞掉。
 *
 * @param {Array<{serverName: string, layerName: string, title?: string}>} sources
 *   按叠放顺序（上 → 下）排好的查询源
 * @param {{lon: number, lat: number}} lonLat - 点击点经纬度
 * @param {AbortSignal} signal - 取消信号（同一信号串行用）
 * @param {() => boolean} isStale - 本次点击是否已作废（又点了一次 / 切了图层 / 组件卸载）
 * @returns {Promise<{source: object, features: Array<object>}|null>} 命中结果；都没命中为 null
 */
async function queryFirstHit(sources, lonLat, signal, isStale) {
  for (const source of sources) {
    if (isStale()) return null;

    let features;
    try {
      features = await queryThemeFeaturesAtPoint({
        serverName: source.serverName,
        layerName: source.layerName,
        lon: lonLat.lon,
        lat: lonLat.lat,
        signal,
      });
    } catch (error) {
      // 取消是调用方主动发起的，交给外层统一处理
      if (error.name === "AbortError") throw error;

      console.warn(
        `[PointQuery] 图层「${source.title || source.serverName}」查询失败，继续查下一层:`,
        error,
      );
      continue;
    }

    if (isStale()) return null;
    if (features.length > 0) return { source, features };
  }
  return null;
}

/**
 * 专题图（WMTS）点图查询的交互逻辑
 *
 * 点击地图 → 取当前显示的 WMTS 图层（从上层到下层） → 用点击点构造闭合小矩形 →
 * 逐层请求 `<themeQueryRoot>/<服务名>/<图层名>/query?spatialFilter=...&limit=1&withGeometry=true` →
 * 第一个命中的要素交给 FeaturePopup 展示属性，并用查询返回的 `shape`（WKT）画一份红色高亮。
 *
 * 查询源由调用方解析后传入，数组顺序就是叠放顺序（最上层在前）：
 * `ThemeSwitcher` 把 `querySource` 登记到 mapStore 的图层上，调用方按 mapStore
 * 图层顺序倒序（后加载的在上层）后传进来。
 *
 * 只查当前要素：始终带 `spatialFilter`，不传就是全表查询（单个图层可能几十 MB）。
 *
 * 点击到 Cesium 实体（GeoJSON 要素 / WFS 要素）或 3D Tiles 模型时
 * 直接跳过，交给各自的点击逻辑：实体由 CesiumViewer 处理，模型不是实体、
 * 点它也不该去查瓦片影像下面的面。拾取走 `pickEntity()`：红色高亮覆盖层被标记为
 * 不参与拾取，点击会穿透到下面的业务图层。
 *
 * @param {Array<{serverName: string, layerName: string, title?: string}>} sources
 *   可查询的 WMTS 服务，按叠放顺序（上 → 下）排列；空数组表示没有可查询的图层
 *   （点图查询整体不生效）
 */
export default function usePointQuery(sources) {
  const viewer = useCesiumStore((s) => s.viewer);
  const ready = useCesiumStore((s) => s.ready);
  const selectedFeature = useMapStore((s) => s.selectedFeature);

  // 点击回调只注册一次；用 ref 读最新查询源，避免每次切换图层都重建 handler
  const sourcesRef = useRef(sources);
  useEffect(() => {
    sourcesRef.current = sources;
  }, [sources]);

  /** 请求序号：连续点击 / 切换图层时，只让最后一次查询的结果落到弹窗 */
  const querySeqRef = useRef(0);
  /** 进行中的查询；切换图层或发起新查询时取消 */
  const abortRef = useRef(null);

  /** 当前高亮覆盖层；同一时间只保留一份 */
  const highlightLayerRef = useRef(null);
  /** 高亮序号：查询 / 关闭弹窗 / 切换图层时让旧的异步高亮作废 */
  const highlightSeqRef = useRef(0);

  const clearHighlight = useCallback(() => {
    highlightSeqRef.current += 1;
    if (highlightLayerRef.current) {
      removeGeoJsonLayer(
        useCesiumStore.getState().viewer,
        highlightLayerRef.current,
      );
      highlightLayerRef.current = null;
    }
  }, []);

  // 右侧工具栏的「清除高亮」：除了摘高亮，还要取消在途查询并作废查询结果，
  // 否则请求回来后会重新弹窗、重新把高亮画上。
  useEffect(
    () =>
      registerHighlightClearer(() => {
        querySeqRef.current += 1;
        abortRef.current?.abort();
        abortRef.current = null;
        clearHighlight();
      }),
    [clearHighlight],
  );

  // 弹窗被关闭（✕ / 点空白 / 切到其它选中）时，同步摘掉专题高亮
  useEffect(() => {
    if (!selectedFeature) clearHighlight();
  }, [selectedFeature, clearHighlight]);

  // 可查询图层集合变化（勾选 / 取消 / 切专题图）后，旧弹窗与高亮都不属于当前图层集合：
  // 关掉弹窗、摘掉高亮，并取消在途查询。用「服务名/图层名」拼成 key 比较，
  // 数组每次渲染都是新引用，不能直接比引用。
  const sourcesKey = (sources ?? [])
    .map((source) => `${source.serverName}/${source.layerName}`)
    .join("|");
  const prevSourcesKeyRef = useRef(sourcesKey);
  useEffect(() => {
    if (prevSourcesKeyRef.current === sourcesKey) return;
    prevSourcesKeyRef.current = sourcesKey;
    querySeqRef.current += 1;
    abortRef.current?.abort();
    clearHighlight();
    useMapStore.getState().clearSelection();
  }, [sourcesKey, clearHighlight]);

  useEffect(() => {
    // 路由切换时新页面可能先于旧 viewer 销毁、新 viewer 就绪而挂载：
    // effect 闭包里捕获的 viewer 可能是已销毁的旧实例（此时 store 的 ready 仍为 true），
    // 访问 viewer.scene（Cesium 内部读 this._cesiumWidget.scene）会抛
    // TypeError: Cannot read properties of undefined (reading 'scene')。
    // 因此这里实时读取 store，并对已销毁实例做防御。
    const { viewer: currentViewer, ready: isReady } = useCesiumStore.getState();
    if (!isReady || !currentViewer || currentViewer.isDestroyed()) {
      return undefined;
    }

    let disposed = false;

    const handler = new Cesium.ScreenSpaceEventHandler(
      currentViewer.scene.canvas,
    );

    handler.setInputAction(async (click) => {
      const activeSources = sourcesRef.current;
      if (!activeSources?.length || currentViewer.isDestroyed()) return;

      // 点到实体：交给 CesiumViewer 的实体点击（示例页面高亮 / WFS 属性弹窗 /
      // 同时把上一次的专题高亮摘掉，避免两份高亮叠在一起。
      // 专题高亮自身不参与拾取（pickable: false），不会把自己挡在下面。
      const entity = pickEntity(currentViewer, click.position);
      if (entity) {
        clearHighlight();
        return;
      }

      // 点到 3D Tiles 模型：模型不是实体，`pickEntity()`
      // 返回 null，但 `scene.pick()` 能拿到瓦片要素。点模型不应穿透去查它下面的
      // WMTS 面，否则会在模型上弹出一个不相干的属性框。
      if (pickModelFeature(currentViewer, click.position)) {
        clearHighlight();
        return;
      }

      // 点到天空：CesiumViewer 会清除选中，这里也把专题高亮摘掉
      const lonLat = pickLonLat(currentViewer, click.position);
      if (!lonLat) {
        clearHighlight();
        return;
      }

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      const current = ++querySeqRef.current;

      // 旧高亮先摘掉：查询期间不残留上一处的结果
      clearHighlight();

      const isStale = () => disposed || current !== querySeqRef.current;

      try {
        const hit = await queryFirstHit(
          activeSources,
          lonLat,
          controller.signal,
          isStale,
        );
        if (isStale()) return;

        if (!hit) {
          useMapStore.getState().clearSelection();
          return;
        }

        const { source, features } = hit;
        const feature = features[0];
        const extra =
          features.length > 1
            ? `（命中 ${features.length} 条，显示第 1 条）`
            : "";

        useMapStore.getState().setSelectedFeature({
          id: `theme-query-${source.serverName}`,
          title: `${source.title || source.serverName}${extra}`,
          properties: feature.properties,
          screenX: click.position.x,
          screenY: click.position.y,
        });

        // 高亮与示例页面同一套做法：把当前要素单独画一份覆盖层。
        // 查询结果已带回 shape（WKT），不需要额外请求。
        if (feature.geometry) {
          const highlightSeq = ++highlightSeqRef.current;
          try {
            const highlight = await addGeoJsonLayer(currentViewer, {
              data: {
                type: "Feature",
                geometry: feature.geometry,
                properties: {},
              },
              name: HIGHLIGHT_LAYER_NAME,
              // 高亮只是视觉叠加：不参与拾取，下一次点击能继续查下层要素
              pickable: false,
              ...HIGHLIGHT_OPTION,
            });

            // 加载期间又点了别处 / 关了弹窗 / 切了图层：丢弃这一份
            if (
              disposed ||
              current !== querySeqRef.current ||
              highlightSeq !== highlightSeqRef.current
            ) {
              removeGeoJsonLayer(currentViewer, highlight);
              return;
            }
            highlightLayerRef.current = highlight;
          } catch (error) {
            // 高亮失败不影响已经弹出的属性面板
            console.warn("[PointQuery] 专题要素高亮失败:", error);
          }
        }
      } catch (error) {
        if (isStale()) return;
        if (error.name === "AbortError") return;
        console.error("[PointQuery] 专题要素查询失败:", error);
      }
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

    return () => {
      disposed = true;
      querySeqRef.current += 1;
      abortRef.current?.abort();
      clearHighlight();
      handler.destroy();
    };
  }, [ready, viewer, clearHighlight]);
}

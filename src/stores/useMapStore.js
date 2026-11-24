import { create } from "zustand";

/**
 * 地图图层 / 业务状态管理
 *
 * @property {string} basemapId - 当前底图 ID
 * @property {Array<{
 *   id: string,
 *   name: string,
 *   legendTitle?: string,  // 图例组标题（如「图层 2022」），缺省用 name
 *   visible: boolean,
 *   type: string,
 *   hoverFields?: string[],  // 悬浮弹窗展示的字段
 *   legendSource?: {
 *     serverName: string,
 *     styleId: string,
 *     levelOffset?: number
 *   } | null, // WMTS 图层的图例接口来源；WFS 图层为 null
 *   querySource?: {
 *     serverName: string,
 *     layerName: string
 *   } | null  // WMTS 图层的点图查询来源；WFS 图层为 null
 * }>} layers - 图层列表
 * @property {string|null} selectedFeatureId - 选中的要素 ID
 * @property {{
 *   id: string,
 *   properties: Record<string, any>,
 *   screenX: number,
 *   screenY: number,
 * }|null} selectedFeature - 当前选中的要素完整信息（含屏幕坐标）
 * @property {(basemapId: string) => void} setBasemap - 设置底图
 * @property {(layer: object) => void} addLayer - 添加图层
 * @property {(id: string) => void} removeLayer - 移除图层
 * @property {(id: string) => void} toggleLayerVisibility - 切换图层可见性
 * @property {(featureId: string|null) => void} selectFeature - 选中要素
 * @property {(feature: object|null) => void} setSelectedFeature - 设置选中要素（含属性+坐标）
 * @property {() => void} clearSelection - 取消选中
 * @property {{
 *   id: string,
 *   properties: Record<string, any>,
 *   screenX: number,
 *   screenY: number,
 * }|null} hoveredFeature - 当前 hover 的要素信息（含屏幕坐标）
 * @property {(feature: object|null) => void} setHoveredFeature - 设置 hover 要素
 * @property {() => void} clearHoveredFeature - 清除 hover 要素
 */
const useMapStore = create((set) => ({
  basemapId: "default",
  layers: [],
  selectedFeatureId: null,
  selectedFeature: null,
  hoveredFeature: null,

  setBasemap: (basemapId) => set({ basemapId }),

  addLayer: (layer) =>
    set((state) => ({
      layers: [...state.layers, layer],
    })),

  removeLayer: (id) =>
    set((state) => ({
      layers: state.layers.filter((l) => l.id !== id),
    })),

  toggleLayerVisibility: (id) =>
    set((state) => ({
      layers: state.layers.map((l) =>
        l.id === id ? { ...l, visible: !l.visible } : l,
      ),
    })),

  selectFeature: (featureId) => set({ selectedFeatureId: featureId }),

  setSelectedFeature: (feature) => set({ selectedFeature: feature }),

  clearSelection: () => set({ selectedFeature: null, selectedFeatureId: null }),

  setHoveredFeature: (feature) => set({ hoveredFeature: feature }),

  clearHoveredFeature: () => set({ hoveredFeature: null }),
}));

export default useMapStore;

import { create } from "zustand";

/**
 * Cesium 全局状态
 *
 * @property {object|null} viewer - Cesium.Viewer 实例
 * @property {boolean} ready - Cesium 是否已加载就绪
 * @property {{longitude: number, latitude: number, height: number}|null} cameraPosition - 当前相机位置
 * @property {{heading: number, pitch: number, roll: number}|null} cameraOrientation - 当前相机姿态
 * @property {(viewer: object) => void} setViewer - 初始化 Viewer
 * @property {(pos, orient) => void} updateCamera - 更新相机位置
 * @property {(ready: boolean) => void} setReady - 设置就绪状态
 */
const useCesiumStore = create((set) => ({
  viewer: null,
  ready: false,
  cameraPosition: null,
  cameraOrientation: null,

  setViewer: (viewer) => set({ viewer }),

  updateCamera: (cameraPosition, cameraOrientation) =>
    set({ cameraPosition, cameraOrientation }),

  setReady: (ready) => set({ ready }),
}));

export default useCesiumStore;

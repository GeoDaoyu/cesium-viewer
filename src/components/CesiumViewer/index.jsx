import { useEffect, useRef, useCallback } from "react";
import { Spin } from "antd";
import * as Cesium from "cesium";
import "cesium/Build/Cesium/Widgets/widgets.css";
import { useCesiumStore, useMapStore } from "@/stores";
import {
  clearEntityHighlight,
  highlightFeature,
  setEntityHighlight,
} from "@/utils/highlight";
import { pickEntity } from "@/utils/pick";
import { BASEMAP, CESIUM_ION_TOKEN } from "@/utils/appConfig";
import { createBasemapLayer } from "@/utils/layers/basemap";
import { createTerrainProvider } from "@/utils/layers/terrain";
import styles from "./index.less";

/**
 * Cesium 三维地球组件
 *
 * 职责：
 * 1. 初始化 Cesium.Viewer（底图 + 地形 + 相机操作风格）
 * 2. 把 viewer 注册到 zustand store，供其它组件使用
 * 3. 注册实体点击 / 悬停，把属性写入 mapStore 供弹窗展示
 * 4. 卸载时销毁 viewer，释放资源
 */
export default function CesiumViewer() {
  const containerRef = useRef(null);
  const viewerRef = useRef(null);

  const setViewer = useCesiumStore((s) => s.setViewer);
  const setReady = useCesiumStore((s) => s.setReady);
  const updateCamera = useCesiumStore((s) => s.updateCamera);
  const ready = useCesiumStore((s) => s.ready);

  const handleCameraChange = useCallback(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;

    const camera = viewer.camera;
    const cartographic = Cesium.Cartographic.fromCartesian(
      camera.position,
      Cesium.Ellipsoid.WGS84,
    );

    updateCamera(
      {
        longitude: Cesium.Math.toDegrees(cartographic.longitude),
        latitude: Cesium.Math.toDegrees(cartographic.latitude),
        height: cartographic.height,
      },
      {
        heading: Cesium.Math.toDegrees(camera.heading),
        pitch: Cesium.Math.toDegrees(camera.pitch),
        roll: Cesium.Math.toDegrees(camera.roll),
      },
    );
  }, [updateCamera]);

  useEffect(() => {
    if (!containerRef.current || viewerRef.current) return;

    // 仅用于可选的 Ion 资产（ionAssetId 形式的 3D Tiles）；底图不依赖 Ion
    Cesium.Ion.defaultAccessToken = CESIUM_ION_TOKEN;

    const viewer = new Cesium.Viewer(containerRef.current, {
      // 底图配置见 public/config/app.js；未配置时传 false，不建默认 Ion 影像
      baseLayer: createBasemapLayer(BASEMAP),
      animation: false,
      timeline: false,
      baseLayerPicker: false,
      fullscreenButton: false,
      geocoder: false,
      homeButton: false,
      infoBox: false,
      sceneModePicker: false,
      selectionIndicator: false,
      navigationHelpButton: false,
      projectionPicker: false,
    });

    // 三维地形：异步挂载，失败只告警，地球保持光滑椭球
    let terrainCancelled = false;
    createTerrainProvider()
      .then((terrainProvider) => {
        if (!terrainProvider || terrainCancelled || viewer.isDestroyed())
          return;
        viewer.terrainProvider = terrainProvider;
      })
      .catch((error) => {
        console.warn("[terrain] 地形加载失败，回退光滑椭球：", error);
      });

    // 鼠标操作映射为 ArcGIS SceneView (3D) 风格：
    // 左键 / 右键拖拽旋转，右键拖拽倾斜，滚轮缩放
    const { CameraEventType, KeyboardEventModifier } = Cesium;
    const controller = viewer.scene.screenSpaceCameraController;
    controller.rotateEventTypes = [
      CameraEventType.LEFT_DRAG,
      CameraEventType.RIGHT_DRAG,
    ];
    controller.tiltEventTypes = [
      CameraEventType.MIDDLE_DRAG,
      CameraEventType.RIGHT_DRAG,
      CameraEventType.PINCH,
      {
        eventType: CameraEventType.LEFT_DRAG,
        modifier: KeyboardEventModifier.CTRL,
      },
      {
        eventType: CameraEventType.RIGHT_DRAG,
        modifier: KeyboardEventModifier.CTRL,
      },
    ];
    controller.zoomEventTypes = [CameraEventType.WHEEL, CameraEventType.PINCH];

    viewer.camera.changed.addEventListener(handleCameraChange);
    // changed 在飞行过程中持续触发，最后一帧未必落到终点；moveEnd 补一次同步
    viewer.camera.moveEnd.addEventListener(handleCameraChange);

    // 资源加载期间的兜底视角（全球范围）
    viewer.camera.setView({
      destination: Cesium.Cartesian3.fromDegrees(104.0, 35.0, 10000000),
      orientation: {
        heading: Cesium.Math.toRadians(0),
        pitch: Cesium.Math.toRadians(-90),
        roll: 0,
      },
    });

    viewerRef.current = viewer;
    setViewer(viewer);

    // 启用时钟动画，否则 CallbackProperty 等动态属性不会逐帧更新
    viewer.clock.shouldAnimate = true;

    handleCameraChange();

    const screenSpaceHandler = new Cesium.ScreenSpaceEventHandler(
      viewer.scene.canvas,
    );

    // ---- 左键点击：实体高亮 + 属性弹窗 ----
    screenSpaceHandler.setInputAction((click) => {
      // 高亮覆盖层不参与拾取，点击直接落到下层的业务实体上
      const entity = pickEntity(viewer, click.position);

      if (!entity) {
        clearEntityHighlight();
        useMapStore.getState().clearSelection();
        return;
      }

      const ds = entity.entityCollection?.owner;
      if (ds) {
        setEntityHighlight(highlightFeature(ds, entity.id));
      }

      let properties = {};
      if (entity.properties) {
        try {
          properties =
            entity.properties.getValue(Cesium.JulianDate.now()) || {};
        } catch {
          properties = { ...entity.properties };
        }
      }

      useMapStore.getState().setSelectedFeature({
        id: entity.id,
        properties,
        screenX: click.position.x,
        screenY: click.position.y,
      });
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

    // ---- 悬停：节流 100ms，只给 HoverPopup 提供数据 ----
    const hoverThrottleRef = { lastTime: 0 };

    screenSpaceHandler.setInputAction((movement) => {
      const now = performance.now();
      if (now - hoverThrottleRef.lastTime < 100) return;
      hoverThrottleRef.lastTime = now;

      const entity = pickEntity(viewer, movement.endPosition);

      if (!entity) {
        useMapStore.getState().clearHoveredFeature();
        return;
      }

      let properties = {};
      if (entity.properties) {
        try {
          properties =
            entity.properties.getValue(Cesium.JulianDate.now()) || {};
        } catch {
          properties = { ...entity.properties };
        }
      }

      useMapStore.getState().setHoveredFeature({
        id: entity.id,
        properties,
        screenX: movement.endPosition.x,
        screenY: movement.endPosition.y,
      });
    }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);

    setReady(true);

    return () => {
      // 先重置 store 中的引用，让其它组件的 cleanup 拿到 null 安全退出，
      // 再销毁 viewer
      setViewer(null);
      setReady(false);
      screenSpaceHandler.destroy();
      clearEntityHighlight();
      terrainCancelled = true;
      if (viewerRef.current) {
        viewerRef.current.camera.changed.removeEventListener(
          handleCameraChange,
        );
        viewerRef.current.camera.moveEnd.removeEventListener(
          handleCameraChange,
        );
        viewerRef.current.destroy();
        viewerRef.current = null;
      }
    };
  }, [setViewer, setReady, handleCameraChange]);

  return (
    <div className={styles.viewerContainer}>
      <div ref={containerRef} className={styles.cesiumWidget} />
      {!ready && (
        <div className={styles.loading}>
          <Spin size="large" description="Cesium 加载中..." />
        </div>
      )}
    </div>
  );
}

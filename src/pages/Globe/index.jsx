import { useEffect, useRef } from "react";
import CesiumViewer from "@/components/CesiumViewer";
import LeftPanel from "@/components/LeftPanel";
import RightPanel from "@/components/RightPanel";
import Legend from "@/components/Legend";
import Toolbar from "@/components/Toolbar";
import FeaturePopup from "@/components/FeaturePopup";
import HoverPopup from "@/components/HoverPopup";
import PanelCard from "@/components/PanelCard";
import CameraTour from "@/components/CameraTour";
import CameraInfo from "@/components/CameraInfo";
import LayerStatus from "@/components/LayerStatus";
import ThemeSwitcher from "@/components/map-components/ThemeSwitcher";
import BasemapSwitcher from "@/components/map-components/BasemapSwitcher";
import PointQuery from "@/components/map-components/PointQuery";
import { useCesiumStore } from "@/stores";
import { flyHome } from "@/utils/toolbar";
import styles from "./index.less";

/** 操作说明（左侧面板） */
function UsagePanel() {
  return (
    <PanelCard title="操作说明">
      <ul className={styles.usage}>
        <li>左键 / 右键拖拽：旋转视角</li>
        <li>右键拖拽（或中键）：倾斜视角</li>
        <li>滚轮：缩放</li>
        <li>点击要素：查看属性并高亮</li>
        <li>左下角图例、右下角工具栏</li>
      </ul>
    </PanelCard>
  );
}

/**
 * 示例页
 *
 * 布局与常规 Cesium 应用一致：两侧半透明面板 + 中间全屏地球，地图交互组件
 * （底图切换 / 图层树 / 属性弹窗 / 图例 / 工具栏）都以绝对定位叠在地图画布上。
 */
export default function GlobePage() {
  const viewer = useCesiumStore((s) => s.viewer);
  const ready = useCesiumStore((s) => s.ready);
  const hasFlownRef = useRef(false);

  // 首屏飞到默认视角（HOME_VIEW，见 utils/camera/homeView.js）
  useEffect(() => {
    if (hasFlownRef.current) return;

    // 路由切换时旧 viewer 可能已销毁、新 viewer 还没就绪，实时读 store 防御
    const { viewer: currentViewer, ready: isReady } = useCesiumStore.getState();
    if (!isReady || !currentViewer || currentViewer.isDestroyed()) return;

    hasFlownRef.current = true;
    flyHome(currentViewer);
  }, [ready, viewer]);

  return (
    <div className={styles.page}>
      <LeftPanel collapsible content={[CameraTour, UsagePanel]} />

      <div className={styles.center}>
        <div className={styles.mapArea}>
          <CesiumViewer />
          <ThemeSwitcher />
          <BasemapSwitcher />
          <PointQuery />
          <FeaturePopup />
          <HoverPopup />
          <Toolbar />
          <Legend />
        </div>
      </div>

      <RightPanel collapsible content={[CameraInfo, LayerStatus]} />
    </div>
  );
}

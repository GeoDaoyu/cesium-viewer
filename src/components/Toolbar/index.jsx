import { Button } from "antd";
import {
  ClearOutlined,
  HomeOutlined,
  PlusCircleOutlined,
  MinusCircleOutlined,
} from "@ant-design/icons";
import { useCesiumStore } from "@/stores";
import { flyHome, zoomIn, zoomOut, resetHeading } from "@/utils/toolbar";
import { clearAllHighlights } from "@/utils/highlights";
import compassSvg from "./images/compass.svg";
import styles from "./index.less";

export default function Toolbar() {
  const viewer = useCesiumStore((s) => s.viewer);
  const ready = useCesiumStore((s) => s.ready);
  const headingDeg = useCesiumStore((s) => s.cameraOrientation?.heading);

  if (!ready || !viewer) return null;

  return (
    <div className={styles.toolbar}>
      {/* 清除地图上所有一次性高亮（点图查询、实体高亮等） */}
      <Button
        className={styles.btn}
        icon={<ClearOutlined />}
        onClick={() => clearAllHighlights(viewer)}
        title="清除高亮"
      />

      {/* 回到默认视角 */}
      <Button
        className={styles.btn}
        icon={<HomeOutlined />}
        onClick={() => flyHome(viewer)}
        title="回到默认视角"
      />

      {/* 放大 */}
      <Button
        className={styles.btn}
        icon={<PlusCircleOutlined />}
        onClick={() => zoomIn(viewer)}
        title="放大"
      />

      {/* 缩小 */}
      <Button
        className={styles.btn}
        icon={<MinusCircleOutlined />}
        onClick={() => zoomOut(viewer)}
        title="缩小"
      />

      {/* 指北针 — 始终指向北，点击重置 heading */}
      <img
        src={compassSvg}
        alt="指北针"
        className={styles.compass}
        onClick={() => resetHeading(viewer)}
        title="指北 — 点击归北"
        style={{ transform: `rotate(${-(headingDeg ?? 0)}deg)` }}
      />
    </div>
  );
}

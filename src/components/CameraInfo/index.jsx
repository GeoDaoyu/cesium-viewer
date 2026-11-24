import { useCesiumStore } from "@/stores";
import PanelCard from "@/components/PanelCard";
import styles from "./index.less";

/**
 * 相机信息面板
 *
 * 实时展示相机经纬度 / 海拔 / 朝向，数据来自 CesiumViewer 写入
 * `useCesiumStore` 的 cameraPosition / cameraOrientation。
 */
const toFixed = (value, digits = 6) =>
  Number.isFinite(value) ? value.toFixed(digits) : "-";

export default function CameraInfo() {
  const position = useCesiumStore((s) => s.cameraPosition);
  const orientation = useCesiumStore((s) => s.cameraOrientation);

  const rows = [
    ["经度", `${toFixed(position?.longitude)}°`],
    ["纬度", `${toFixed(position?.latitude)}°`],
    ["海拔", `${toFixed(position?.height, 0)} m`],
    ["朝向", `${toFixed(orientation?.heading, 2)}°`],
    ["俯仰", `${toFixed(orientation?.pitch, 2)}°`],
    ["翻滚", `${toFixed(orientation?.roll, 2)}°`],
  ];

  return (
    <PanelCard title="相机信息">
      <dl className={styles.grid}>
        {rows.map(([label, value]) => (
          <div key={label} className={styles.row}>
            <dt className={styles.key}>{label}</dt>
            <dd className={styles.value}>{value}</dd>
          </div>
        ))}
      </dl>
    </PanelCard>
  );
}

import { useMapStore } from "@/stores";
import PanelCard from "@/components/PanelCard";
import styles from "./index.less";

const TYPE_LABEL = {
  wfs: "WFS",
  wmts: "WMTS",
  geojson: "GeoJSON",
  markers: "标注点",
  query: "查询",
  "3dtiles": "3D Tiles",
};

/**
 * 已加载图层列表
 *
 * 数据来自 `useMapStore.layers`（ThemeSwitcher 勾选后注册）。这里只做展示，
 * 图层的加载 / 卸载由 ThemeSwitcher 负责。
 */
export default function LayerStatus() {
  const layers = useMapStore((s) => s.layers);

  return (
    <PanelCard title="已加载图层" extra={`${layers.length}`}>
      {layers.length === 0 ? (
        <p className={styles.empty}>暂无图层，在左上角勾选专题图层</p>
      ) : (
        <ul className={styles.list}>
          {layers.map((layer) => (
            <li key={layer.id} className={styles.item}>
              <span className={styles.name}>{layer.name}</span>
              <span className={styles.type}>
                {TYPE_LABEL[layer.type] || layer.type}
              </span>
            </li>
          ))}
        </ul>
      )}
    </PanelCard>
  );
}

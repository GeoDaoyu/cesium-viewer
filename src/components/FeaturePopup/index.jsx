import { useMapStore } from "@/stores";
import { fieldLabel, hasFieldLabel } from "@/utils/appConfig";
import styles from "./index.less";

/**
 * 要素属性弹窗
 *
 * 在 Cesium 地球上点击 WFS / GeoJSON 矢量要素时，
 * 以浮动面板的形式展示该要素的属性字段。
 *
 * 数据来源：useMapStore.selectedFeature（由 CesiumViewer 的实体点击或
 * PointQuery 的专题图点图查询填充）；`title` 可选，缺省显示「要素信息」。
 * 关闭方式：点击 ✕ 按钮，或点击地图空白处
 *
 * 只展示 `public/config/fieldLabels.<环境>.js` 对照表里收录的字段，字段名换成中文
 * （见 hasFieldLabel() / fieldLabel()）；服务直接以中文字段名返回的属性（如第一批
 * 组团的「组团名称」/「序号」）原样展示。其余未收录的一律隐藏 —— OBJECTID、SHAPE、
 * SHAPELENG、SHAPEAREA 之类系统字段原本就不在表里；要显示某个字段，往表里加一条。
 */
export default function FeaturePopup() {
  const feature = useMapStore((s) => s.selectedFeature);
  const clearSelection = useMapStore((s) => s.clearSelection);

  if (!feature) return null;

  const entries = Object.entries(feature.properties).filter(([key]) =>
    hasFieldLabel(key),
  );

  return (
    <div
      className={styles.popup}
      style={{
        left: feature.screenX + 12,
        top: feature.screenY - 24,
      }}
    >
      <div className={styles.header}>
        <span className={styles.title}>{feature.title || "要素信息"}</span>
        <button
          className={styles.closeBtn}
          onClick={(e) => {
            e.stopPropagation();
            clearSelection();
          }}
        >
          ✕
        </button>
      </div>

      {entries.length === 0 ? (
        <div className={styles.empty}>无属性数据</div>
      ) : (
        <div className={styles.body}>
          <table className={styles.table}>
            <tbody>
              {entries.map(([key, value]) => (
                <tr key={key}>
                  <td className={styles.key}>{fieldLabel(key)}</td>
                  <td className={styles.value}>{formatValue(value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/**
 * 属性值格式化
 * - null / undefined → "-"
 * - object → JSON 缩进字符串
 * - 其余 → String
 */
function formatValue(v) {
  if (v === null || v === undefined) return "-";
  if (typeof v === "object") {
    try {
      return JSON.stringify(v, null, 2);
    } catch {
      return String(v);
    }
  }
  return String(v);
}

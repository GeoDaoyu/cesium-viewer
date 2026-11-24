import { useMapStore } from "@/stores";
import styles from "./index.less";

/**
 * Hover 弹窗组件
 *
 * 当鼠标 hover 到配置了 hoverFields 的专题图层要素上时，
 * 在光标附近展示指定的属性字段（两列：字段名 + 字段值）。
 *
 * 数据来源：useMapStore.hoveredFeature（由 CesiumViewer 的 MOUSE_MOVE 填充）
 * 显示字段：由专题图层配置（themeOptions）中的 hoverFields 决定
 * 关闭时机：鼠标移出要素区域
 *
 * 与 FeaturePopup 的区别：
 *   - FeaturePopup 点击触发，展示全部属性
 *   - HoverPopup hover 触发，仅展示配置的字段，更轻量
 */
export default function HoverPopup() {
  const hovered = useMapStore((s) => s.hoveredFeature);
  const layers = useMapStore((s) => s.layers);

  if (!hovered) return null;

  // 找到当前配置了 hoverFields 的图层
  const activeLayer = layers.find(
    (l) => l.hoverFields && l.hoverFields.length > 0,
  );
  if (!activeLayer) return null;

  const { hoverFields } = activeLayer;
  const { properties, screenX, screenY } = hovered;

  // 检查要素是否包含配置的字段（至少一个匹配才显示）
  const hasFields = hoverFields.some((f) => f in properties);
  if (!hasFields) return null;

  return (
    <div
      className={styles.popup}
      style={{
        left: screenX + 14,
        top: screenY - 16,
      }}
    >
      <table className={styles.table}>
        <tbody>
          {hoverFields.map((field) => (
            <tr key={field}>
              <td className={styles.key}>{field}</td>
              <td className={styles.value}>{formatValue(properties[field])}</td>
            </tr>
          ))}
        </tbody>
      </table>
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

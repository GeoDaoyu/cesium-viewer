import { useState } from "react";
import { LeftOutlined, RightOutlined } from "@ant-design/icons";
import styles from "./index.less";

function renderPanels(content) {
  if (!content) return null;
  if (Array.isArray(content)) {
    return content.map((Comp, i) => <Comp key={i} />);
  }
  const Comp = content;
  return <Comp />;
}

/**
 * 左侧面板容器（纯布局）
 *
 * `content` 可以是单个 React 组件、组件数组（垂直排列），或 null。
 * `collapsible` 打开后内侧边缘出现收起 / 展开按钮。
 *
 * 收起**只改 CSS**（外层宽度收 0 + 内容层平移），内容始终留在 DOM 里，
 * 不会触发子组件的卸载生命周期：面板里挂着的地图服务只有真正卸载时才移除。
 * 内容层宽度固定，收起时只平移不重排，图表 / 树不会因为宽度变 0 而 resize。
 *
 * @param {React.Component|React.Component[]} [content] - 面板内容
 * @param {boolean} [collapsible] - 是否显示收起 / 展开按钮
 */
export default function LeftPanel({ content, collapsible = false }) {
  const [collapsed, setCollapsed] = useState(false);
  const isCollapsed = collapsible && collapsed;

  return (
    <div
      className={`${styles.panelWrap} ${isCollapsed ? styles.collapsed : ""}`}
    >
      <aside className={styles.leftPanel}>
        <div className={styles.panelBody} inert={isCollapsed || undefined}>
          {renderPanels(content)}
        </div>
      </aside>
      {collapsible && (
        <button
          type="button"
          className={styles.collapseToggle}
          onClick={() => setCollapsed((v) => !v)}
          aria-expanded={!collapsed}
          aria-label={collapsed ? "展开左侧面板" : "收起左侧面板"}
          title={collapsed ? "展开左侧面板" : "收起左侧面板"}
        >
          {collapsed ? <RightOutlined /> : <LeftOutlined />}
        </button>
      )}
    </div>
  );
}

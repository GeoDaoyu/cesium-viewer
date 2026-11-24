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
 * 右侧面板容器（纯布局）
 *
 * `content` 可以是单个 React 组件、组件数组（垂直排列），或 null。
 * `collapsible` 打开后内侧边缘出现收起 / 展开按钮；收起只改 CSS，不卸载内容。
 *
 * @param {React.Component|React.Component[]} [content] - 面板内容
 * @param {boolean} [collapsible] - 是否显示收起 / 展开按钮
 */
export default function RightPanel({ content, collapsible = false }) {
  const [collapsed, setCollapsed] = useState(false);
  const isCollapsed = collapsible && collapsed;

  return (
    <div
      className={`${styles.panelWrap} ${isCollapsed ? styles.collapsed : ""}`}
    >
      <aside className={styles.rightPanel}>
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
          aria-label={collapsed ? "展开右侧面板" : "收起右侧面板"}
          title={collapsed ? "展开右侧面板" : "收起右侧面板"}
        >
          {collapsed ? <LeftOutlined /> : <RightOutlined />}
        </button>
      )}
    </div>
  );
}

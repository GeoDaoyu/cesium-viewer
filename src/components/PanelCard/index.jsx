import styles from "./index.less";

/**
 * 面板卡片：统一的标题 + 内容容器
 *
 * 两侧面板里的子面板都用它包一层，保证边框、标题、内边距一致。
 *
 * @param {object} props
 * @param {string} props.title - 标题
 * @param {React.ReactNode} [props.extra] - 标题右侧的附加内容
 * @param {React.ReactNode} props.children - 内容
 */
export default function PanelCard({ title, extra, children }) {
  return (
    <section className={styles.card}>
      <header className={styles.header}>
        <span className={styles.title}>{title}</span>
        {extra ? <span className={styles.extra}>{extra}</span> : null}
      </header>
      <div className={styles.body}>{children}</div>
    </section>
  );
}

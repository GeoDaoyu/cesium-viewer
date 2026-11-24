import { APP_TITLE, APP_SUBTITLE } from "@/utils/appConfig";
import styles from "./index.less";

/**
 * 顶部标题栏
 *
 * 标题 / 副标题来自运行时配置（public/config/app.js），换项目名不用改代码。
 */
export default function Header() {
  return (
    <header className={styles.header}>
      <div className={styles.brand}>
        <h1 className={styles.title}>{APP_TITLE}</h1>
        {APP_SUBTITLE ? (
          <span className={styles.subtitle}>{APP_SUBTITLE}</span>
        ) : null}
      </div>

      <nav className={styles.nav}>
        <a
          className={styles.link}
          href="https://cesium.com/learn/cesiumjs-learn/"
          target="_blank"
          rel="noreferrer"
        >
          Cesium 文档
        </a>
        <a
          className={styles.link}
          href="https://umijs.org/docs/introduce/introduce"
          target="_blank"
          rel="noreferrer"
        >
          UmiJS 文档
        </a>
      </nav>
    </header>
  );
}

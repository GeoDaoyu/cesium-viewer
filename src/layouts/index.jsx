import { Outlet } from "umi";
import Header from "@/components/Header";
import styles from "./index.less";

export default function BasicLayout() {
  // Header + 页面内容（页面自带 CesiumViewer 与两侧面板）
  return (
    <div className={styles.layout}>
      <Header />
      <div className={styles.body}>
        <Outlet />
      </div>
    </div>
  );
}

import { Select } from "antd";
import { useEffect, useMemo, useRef, useState } from "react";
import { useCesiumStore } from "@/stores";
import { BASEMAP_SERVICES, DEFAULT_BASEMAP_SERVICE } from "@/utils/appConfig";
import { setBasemap } from "@/utils/layers/basemap";
import styles from "./index.less";

/**
 * 底图切换器（地图左上角）
 *
 * 单选，选项来自 `public/config/app.js` 的 `basemapServices`；选中即替换
 * `imageryLayers` 第 0 层。清单为空 / 只有一项时不渲染。
 *
 * 默认底图在 Viewer 创建时就已加载，组件挂载时不再重复替换（否则会白闪一下
 * 重新拉瓦片）；只有用户改了选择才切。
 */
export default function BasemapSwitcher() {
  const viewer = useCesiumStore((s) => s.viewer);
  const ready = useCesiumStore((s) => s.ready);

  const services = BASEMAP_SERVICES;

  // 只把 value / label 传给 antd：配置里的 style 等业务字段不能进 Select
  const options = useMemo(
    () => services.map(({ value, label }) => ({ value, label })),
    [services],
  );

  const serviceMap = useMemo(
    () => new Map(services.map((service) => [service.value, service])),
    [services],
  );
  const initialValue = DEFAULT_BASEMAP_SERVICE?.value ?? null;

  const [value, setValue] = useState(initialValue);

  /** 已经应用的底图 value；等于初始值时说明默认底图还在用 */
  const appliedRef = useRef(initialValue);

  useEffect(() => {
    if (!ready || !viewer || viewer.isDestroyed()) return;
    if (appliedRef.current === value) return;

    const service = serviceMap.get(value);
    if (!service) return;

    const layer = setBasemap(viewer, service);
    if (!layer) return;

    appliedRef.current = value;
  }, [ready, viewer, value, serviceMap]);

  if (options.length <= 1) return null;

  return (
    <div className={styles.wrapper}>
      <Select
        className={styles.basemapSelect}
        value={value}
        onChange={setValue}
        options={options}
        placeholder="选择底图"
        aria-label="底图"
        suffixIcon={<span className={styles.selectArrow}>▾</span>}
        classNames={{ popup: { root: "basemapSwitcherPopup" } }}
      />
    </div>
  );
}

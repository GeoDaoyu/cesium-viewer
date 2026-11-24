import { useEffect, useRef, useState } from "react";
import { Button } from "antd";
import { CaretRightOutlined, PauseOutlined } from "@ant-design/icons";
import { useCesiumStore } from "@/stores";
import { flyToViewpoint } from "@/utils/camera";
import { startRoaming, stopRoaming } from "@/utils/camera/roamPlayer";
import PanelCard from "@/components/PanelCard";
import styles from "./index.less";

/**
 * 相机漫游示例
 *
 * 视角列表写在前端（实际项目也可以来自接口 / 本地文件），点击某个视角飞过去，
 * 或按顺序播放整条路线。连续播放用 `utils/camera/roaming.js` 的 Catmull-Rom
 * 曲线插值，航段之间不停顿；用户按下鼠标 / 滚轮即接管相机、自动结束。
 */
const VIEWPOINTS = [
  {
    name: "示例区域俯瞰",
    position: { longitude: 116.45, latitude: 39.9, height: 120000 },
    orientation: { heading: 0, pitch: -70, roll: 0 },
  },
  {
    name: "西侧斜视",
    position: { longitude: 116.15, latitude: 39.92, height: 55000 },
    orientation: { heading: 90, pitch: -45, roll: 0 },
  },
  {
    name: "东北角近景",
    position: { longitude: 116.6, latitude: 40.02, height: 18000 },
    orientation: { heading: 200, pitch: -35, roll: 0 },
  },
];

export default function CameraTour() {
  const viewer = useCesiumStore((s) => s.viewer);
  const ready = useCesiumStore((s) => s.ready);
  const [playing, setPlaying] = useState(false);
  const playingRef = useRef(false);

  // 卸载时停止漫游，避免组件没了相机还在动
  useEffect(
    () => () => {
      stopRoaming();
      playingRef.current = false;
    },
    [],
  );

  const play = () => {
    if (!viewer || viewer.isDestroyed()) return;

    if (playingRef.current) {
      stopRoaming();
      playingRef.current = false;
      setPlaying(false);
      return;
    }

    startRoaming(viewer, VIEWPOINTS, {
      onFinish: () => {
        playingRef.current = false;
        setPlaying(false);
      },
    });
    playingRef.current = true;
    setPlaying(true);
  };

  const flyTo = (viewpoint) => {
    if (!viewer || viewer.isDestroyed()) return;
    stopRoaming();
    playingRef.current = false;
    setPlaying(false);
    flyToViewpoint(viewer, viewpoint, { duration: 2.0 });
  };

  return (
    <PanelCard
      title="场景漫游"
      extra={
        <Button
          type="text"
          size="small"
          className={styles.playBtn}
          icon={playing ? <PauseOutlined /> : <CaretRightOutlined />}
          onClick={play}
          disabled={!ready}
        >
          {playing ? "停止" : "播放"}
        </Button>
      }
    >
      <ul className={styles.list}>
        {VIEWPOINTS.map((viewpoint) => (
          <li key={viewpoint.name}>
            <button
              type="button"
              className={styles.item}
              onClick={() => flyTo(viewpoint)}
            >
              <span className={styles.name}>{viewpoint.name}</span>
              <span className={styles.meta}>
                {viewpoint.position.height.toLocaleString()} m
              </span>
            </button>
          </li>
        ))}
      </ul>
      <p className={styles.hint}>
        点击视角飞行，或播放整条路线；拖动鼠标即接管相机。
      </p>
    </PanelCard>
  );
}

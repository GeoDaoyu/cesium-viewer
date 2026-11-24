/**
 * 全局漫游播放器（模块级单例）
 *
 * 场景漫游控制面板收起时组件不挂载，但用户从下拉框选择漫游路线后仍应立即
 * 自动播放。因此把「当前正在播放的漫游」托管在本模块，任何组件（常驻自动
 * 播放器、控制面板的手动播放/停止）都能统一启停，避免跨组件传递 ref。
 */
import { playRoaming } from "./roaming";

let stopHandle = null;

/**
 * 启动漫游（会先停止上一次未结束的漫游，并触发其 onFinish）
 * @param {object} viewer - Cesium.Viewer 实例
 * @param {Array} viewpoints - 视角列表
 * @param {object} [options]
 * @param {Function} [options.onFinish] - 播放结束（自然完成或被停止）回调
 * @returns {object} playRoaming 的返回对象（含 stop()），一般无需使用
 */
export function startRoaming(viewer, viewpoints, options = {}) {
  const { onFinish } = options;
  stopRoaming();

  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    stopHandle = null;
    onFinish?.();
  };

  const roaming = playRoaming(viewer, viewpoints, { onFinish: finish });
  stopHandle = () => {
    roaming.stop();
    finish();
  };
  return roaming;
}

/**
 * 停止当前漫游（若有），并触发其 onFinish
 */
export function stopRoaming() {
  stopHandle?.();
  stopHandle = null;
}

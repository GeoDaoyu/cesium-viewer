# Viewer 生命周期与路由切换

## 问题现象

在多页面应用里，每个页面各自渲染一个 `<CesiumViewer />`。路由切换时：

```
页面 A（Viewer A）→ 页面 B → 切回页面 A
Uncaught TypeError: Cannot read properties of undefined (reading 'scene')
```

根因是旧 Viewer 已被 `destroy()`，但新页面的 effect 闭包里还拿着旧实例。

## 为什么会拿到旧 Viewer

React 19 在同一次 commit 里的执行顺序是：

```
旧树 unmount cleanup → 新树子组件 effect → 新树父组件 effect
```

路由切换时：

1. 旧页面卸载 → `viewer.destroy()`，`_cesiumWidget` 被置空；
2. 新页面 render 时，Zustand store 里还是旧 viewer（此时 `ready = true`）；
3. 新页面的 effect 执行时，旧 viewer 已经被销毁；
4. effect 闭包里捕获的 `viewer` 是 render 时的旧快照 → `viewer.camera` 抛错。

典型出错代码：

```js
const viewer = useCesiumStore((s) => s.viewer);
const ready = useCesiumStore((s) => s.ready);

useEffect(() => {
  if (!ready || !viewer) return;
  viewer.camera.flyTo({ ... }); // viewer 可能已销毁
}, [ready, viewer]);
```

## 修复：effect 内实时读 store + isDestroyed

不要在 effect 里依赖 render 时的闭包快照，进入 effect 后重新取当前值：

```js
useEffect(() => {
  const { viewer, ready } = useCesiumStore.getState();
  if (!ready || !viewer || viewer.isDestroyed()) return;

  viewer.camera.flyTo({ ... });
}, [ready]);
```

异步加载图层时同样要复查：

```js
const dataSource = await Cesium.GeoJsonDataSource.load(url);
if (!viewer || viewer.isDestroyed()) return null;
viewer.dataSources.add(dataSource);
```

`isDestroyed()` 是唯一可靠的判断：`viewer` 引用还在，不代表内部 `_cesiumWidget` 还在。

## 组件 cleanup 的顺序

```js
return () => {
  setViewer(null); // 先清 store，让其它组件拿到 null 安全退出
  setReady(false);
  handler.destroy();
  viewer.destroy();
};
```

先清 store 再 destroy，避免其它组件的 cleanup 在 destroy 之后还去访问 viewer。

## 方案 B：把 Viewer 提到 Layout 常驻

另一种彻底的做法是让 Viewer 只创建一次，路由只切换覆盖层：

- 优点：没有 destroy/recreate，相机、图层、地形都不丢；
- 风险：canvas 尺寸随布局变化，需要在路由切换时 `viewer.resize()`；
- 需要把「页面级图层」的清理从组件卸载移到路由变化事件；
- 初始取景、权限、loading 状态都要重新设计。

如果页面不多、切路由不频繁，定点加固（方案 A）更省事；如果 Viewer 是应用核心、
频繁切换页面，常驻方案体验更好。

## 常见坑

- **把 `ready` 当永久有效**：它只表示「曾经就绪」，不代表当前 viewer 还活着；
- **在 cleanup 里异步操作**：组件卸载后再 `setState` 会告警；
- **异步请求返回后直接用闭包里的 viewer**：中间可能已经切了两次路由；
- **多个页面共用一个 store 的 viewer**：新页面 effect 先于旧页面 cleanup 时，
  store 里可能还是旧实例。

## 本仓库实现

- `src/components/CesiumViewer/index.jsx`：创建 / 销毁、cleanup 顺序；
- `src/pages/Globe/index.jsx`：effect 内 `getState()` + `isDestroyed()`；
- `src/components/map-components/ThemeSwitcher/index.jsx`：异步加载后的 viewer 归属判断。

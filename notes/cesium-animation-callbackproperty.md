# CallbackProperty 与时钟动画

## 核心结论

`CallbackProperty` 能逐帧驱动动画，**前提是 `viewer.clock.shouldAnimate = true`**。
否则 `clock.currentTime` 冻结在 Viewer 创建时刻，回调每帧返回同一个值，看不到动画。

```js
const viewer = new Cesium.Viewer(container, {/* ... */});
viewer.clock.shouldAnimate = true;
```

注意这个开关与构造参数 `animation: false`（隐藏时间轴控件）无关，也与
`requestRenderMode` 无关。`animation: false` 只是不显示 UI，时钟照样可以走。

## 标准写法

```js
entity.polygon.outlineColor = new Cesium.CallbackProperty((time, result) => {
  const t = time.secondsOfDay * speed * Math.PI * 2;
  const alpha = minAlpha + (1 - minAlpha) * 0.5 * (1 + Math.sin(t));
  return Cesium.Color.clone(baseColor, result).withAlpha(alpha);
}, false); // isConstant: false
```

要点：

- **第二个参数 `isConstant: false`**：告诉 Cesium 该属性随时间变化，需要逐帧求值；
- **复用 `result`**：用 `Cesium.Color.clone(src, result)`，不要每帧 `new Color()`；
- **用 `time` 参数，不要用 `Date.now()` / `Math.random()`**：后者会让属性无法缓存 / 恢复，
  也不利于回放和暂停。

## 哪些属性可以逐帧求值

| 属性                         | 说明                                           |
| ---------------------------- | ---------------------------------------------- |
| `position`                   | 路径动画的经典用法                             |
| `polygon.outlineColor`       | Cesium 检测到 `isConstant: false` 后逐帧评估   |
| `polygon.material`           | 需要包一层 `ColorMaterialProperty`             |
| `polyline.material`          | 需要 `PolylineDashMaterialProperty` 等材质属性 |
| `label.text` / `label.color` | 逐帧改文字 / 颜色                              |
| `model.scale`                | 按相机距离换算模型大小                         |

材质类属性不能直接把 `CallbackProperty` 赋给 `material`，要包成对应的
`XxxMaterialProperty`：

```js
entity.polygon.material = new Cesium.ColorMaterialProperty(
  new Cesium.CallbackProperty((time, result) => {
    return Cesium.Color.clone(baseColor, result).withAlpha(alpha);
  }, false),
);
```

## 时序：样式要在 dataSources.add() 之前设置

Cesium 在 `dataSources.add()` 时遍历实体，根据属性是否 `isConstant` 决定用
`StaticGeometryVisualizer` 还是 `DynamicGeometryVisualizer`。

```js
// 正确：先设样式 / 动画，再注册
const dataSource = await Cesium.GeoJsonDataSource.load(url);
applyStyle(dataSource);
applyAnimation(dataSource);
viewer.dataSources.add(dataSource);

// 错误：注册后再改成动态属性，visualizer 不会自动升级
viewer.dataSources.add(dataSource);
applyAnimation(dataSource); // 可能不生效
```

## 典型场景

- 边框呼吸闪烁：只改 `outlineColor`，保留填充的分级颜色；
- 流光线条：`PolylineDashMaterialProperty` + 循环位移 `dashPattern`；
- 标注大小按距离换算：`model.scale` 用 `CallbackProperty` 读相机距离。

## 性能

- 每个动态属性每帧都会求值，实体多时开销明显；能用静态样式就不要用 Callback；
- 回调里避免创建新对象、避免 DOM 操作、避免发请求；
- 只在需要时开 `shouldAnimate`，纯静态场景可以关掉。

## 本仓库实现

- `src/components/CesiumViewer/index.jsx`：`clock.shouldAnimate = true`；
- `src/utils/layers/markers.js`：图钉 `model.scale` 按距离逐帧换算。

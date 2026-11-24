import * as Cesium from "cesium";

/**
 * 地图拾取工具：让一次性高亮覆盖层不参与点击 / 悬停
 *
 * 一次性高亮是纯视觉叠加：本身没有可展示的属性，面积大、又盖在业务图层上方。
 * 如果让 `scene.pick()` 命中它们，点击就被这层吃掉了，下层图层收不到点图查询，
 * 悬停还会弹出一个空属性框。
 *
 * Cesium 的 Entity 没有 `allowPicking`（只有 Primitive 有），所以这里用
 * `scene.drillPick()` 往下钻，跳过标记过的数据源、取第一个普通实体。
 */

/** 不参与拾取的数据源（WeakSet：数据源移除后自动回收，不跨 viewer 串） */
const nonPickableSources = new WeakSet();

/**
 * 一次 drillPick 最多看几层
 *
 * 当前最多叠三份高亮（区域面 / 示例页面 / 专题图），再留几层业务图层。
 */
const DRILL_PICK_LIMIT = 10;

/**
 * 把数据源标记为「不参与拾取」
 *
 * 由 `addGeoJsonLayer({ pickable: false })` 调用。标记的是数据源而不是实体：
 * 实体归 Cesium 管理，不给它挂业务字段；同一数据源里以后新增的实体也自动生效。
 *
 * @param {Cesium.DataSource} dataSource - 高亮覆盖层的数据源
 */
export function markDataSourceNonPickable(dataSource) {
  if (dataSource) nonPickableSources.add(dataSource);
}

/**
 * 实体是否属于标记过的数据源
 *
 * @param {Cesium.Entity} entity
 * @returns {boolean}
 */
function isNonPickable(entity) {
  const source = entity?.entityCollection?.owner;
  return Boolean(source && nonPickableSources.has(source));
}

/**
 * 从 `scene.pick()` / `scene.drillPick()` 的返回值里取实体
 *
 * @param {object} picked - 拾取结果（可能为空，也可能是 3D Tiles 要素等非实体对象）
 * @returns {Cesium.Entity|null}
 */
function toEntity(picked) {
  return Cesium.defined(picked) && picked.id instanceof Cesium.Entity
    ? picked.id
    : null;
}

/**
 * 拾取屏幕位置上最上层的实体，忽略高亮覆盖层
 *
 * 与 `scene.pick()` 的区别只有一点：顶部是标记过的数据源时继续往下找，
 * 因此高亮层像不存在一样，点击可以穿透到下面的业务图层。点到地表 / 天空 /
 * 3D Tiles 要素时仍返回 null（与原逻辑一致）。
 *
 * @param {Cesium.Viewer} viewer - Cesium Viewer 实例
 * @param {Cesium.Cartesian2} position - 屏幕坐标
 * @returns {Cesium.Entity|null} 最上层可点击的实体
 */
export function pickEntity(viewer, position) {
  if (!viewer || viewer.isDestroyed() || !position) return null;

  const { scene } = viewer;
  const entity = toEntity(scene.pick(position));

  // 没命中实体，或顶层就是普通实体：与原来的 scene.pick 行为一致
  if (!entity || !isNonPickable(entity)) return entity;

  // 顶层是禁用拾取的高亮覆盖层：往下钻，取第一个不是高亮的实体
  const drilled = scene.drillPick(position, DRILL_PICK_LIMIT);
  for (let i = 0; i < drilled.length; i++) {
    const below = toEntity(drilled[i]);
    // 高亮层下面是 3D Tiles 要素等非实体对象：不参与实体点击，按「点空」处理
    if (!below) return null;
    if (!isNonPickable(below)) return below;
  }
  return null;
}

/**
 * 点击位置是否命中 3D Tiles 模型
 *
 * 3D Tiles 的瓦片要素不是 Cesium Entity，`pickEntity()` 会把它当成「点空」
 * （`scene.pick()` 返回的 `id` 不是 Entity）。地图上叠着 3D Tiles 模型时，
 * 点图查询要单独把这种点击排除掉 —— 点模型时不应该穿透到模型下面的 WMTS 面、
 * 弹出一个不相干的属性框。
 *
 * 注意 `scene.pick()` 默认只拾取不透明 / 顶层对象，模型在瓦片影像之上，
 * 因此这里只判断最顶层的结果，不做 drillPick。
 *
 * @param {Cesium.Viewer} viewer - Cesium Viewer 实例
 * @param {Cesium.Cartesian2} position - 屏幕坐标
 * @returns {Cesium.Cesium3DTileFeature|null} 命中的模型瓦片要素；没命中时为 null
 */
export function pickModelFeature(viewer, position) {
  if (!viewer || viewer.isDestroyed() || !position) return null;

  const picked = viewer.scene.pick(position);
  if (!Cesium.defined(picked)) return null;

  return picked instanceof Cesium.Cesium3DTileFeature ? picked : null;
}

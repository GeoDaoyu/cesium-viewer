import * as Cesium from "cesium";
import { TILESET_HEIGHT_OFFSET } from "../appConfig";

/**
 * 把 tileset 整体沿地表法线方向平移指定高度
 *
 * `Cesium3DTileset.modelMatrix` 是根 tile 的**父变换**（根 tile 的
 * `computedTransform = modelMatrix * 根 tile 自身 transform`），所以左乘一个
 * 平移矩阵就能让整棵树一起移动，不必改 tileset.json 里的 transform。
 * 偏移量在 ECEF 下做纯平移，方向取包围球中心处的椭球法线（即大地高的「上」）。
 *
 * 与调用方传入的 `modelMatrix` 相乘而不是覆盖：`lift * modelMatrix` 的平移分量
 * 就是 `lift + 原平移`，抬升始终发生在世界坐标里，不受模型自身旋转影响。
 *
 * @param {Cesium.Cesium3DTileset} tileset - 已加载完成的 3D Tiles 数据集
 * @param {number} heightOffset - 抬升高度（米），0 / 空值时不处理
 */
function applyHeightOffset(tileset, heightOffset) {
  if (!heightOffset) return;

  // 包围球中心只用来定「上」的方向，取不到时宁可不动也不乱移
  const center = tileset.boundingSphere?.center;
  if (!center) return;

  // eastNorthUpToFixedFrame 的 z 轴就是该点的椭球法线（大地高的「上」）
  const enu = Cesium.Transforms.eastNorthUpToFixedFrame(center);
  const up = Cesium.Matrix4.getColumn(enu, 2, new Cesium.Cartesian4());
  const offset = Cesium.Cartesian3.multiplyByScalar(
    Cesium.Cartesian3.fromCartesian4(up, new Cesium.Cartesian3()),
    heightOffset,
    new Cesium.Cartesian3(),
  );

  const lift = Cesium.Matrix4.fromTranslation(offset, new Cesium.Matrix4());
  tileset.modelMatrix = Cesium.Matrix4.multiply(
    lift,
    tileset.modelMatrix ?? Cesium.Matrix4.IDENTITY,
    new Cesium.Matrix4(),
  );
}

/**
 * 3D Tiles 图层加载
 *
 * 支持加载 3D Tiles 1.0 / 1.1 规范的数据集，包括倾斜摄影、BIM、点云等。
 * 支持两种来源：标准 tileset.json URL，或 Cesium ION assetId。
 *
 * @param {Cesium.Viewer} viewer - Cesium Viewer 实例
 * @param {object} options - 图层配置
 * @param {string} [options.url] - 3D Tiles tileset.json 的 URL
 * @param {number} [options.ionAssetId] - Cesium ION 资产 ID（与 url 二选一）
 * @param {string} [options.name] - 图层区分名（设置到 tileset.name，便于日志/引用区分）
 * @param {boolean} [options.show=true] - 是否显示
 * @param {number} [options.maximumScreenSpaceError=16] - 最大屏幕空间误差
 * @param {number} [options.maximumMemoryUsage=512] - 最大内存使用量 (MB)
 * @param {boolean} [options.skipLevelOfDetail=false] - 是否跳过细节级别
 * @param {number} [options.skipScreenSpaceErrorFactor=16] - 跳过细节级别误差系数
 * @param {number} [options.baseScreenSpaceError=1024] - 基础屏幕空间误差
 * @param {boolean} [options.skipLevels=0] - 跳过的层级数
 * @param {boolean} [options.immediatelyLoadDesiredLevelOfDetail=false] - 立即加载期望细节
 * @param {boolean} [options.loadSiblings=false] - 是否加载兄弟节点
 * @param {Cesium.ClippingPlaneCollection} [options.clippingPlanes] - 裁剪平面集合
 * @param {Cesium.Matrix4} [options.modelMatrix] - 模型变换矩阵（与抬升相乘，不会被覆盖）
 * @param {number} [options.heightOffset] - 本次加载的抬升高度（米）。缺省取配置项
 *   `tilesetHeightOffset`（`public/config/index.<环境>.js`，默认 5m），传 0 关闭
 * @param {object} [options.headers] - 附加到每个请求的请求头（服务鉴权用）
 * @returns {Promise<Cesium.Cesium3DTileset>} 3D Tiles 数据集实例
 *
 * @example
 * // 从 URL 加载
 * const tileset = await add3DTilesLayer(viewer, {
 *   url: 'https://example.com/tiles/tileset.json',
 * });
 *
 * // 从 Cesium ION 加载
 * const tileset = await add3DTilesLayer(viewer, {
 *   ionAssetId: 96188,  // OSM Buildings
 * });
 */
export async function add3DTilesLayer(viewer, options) {
  const {
    url,
    ionAssetId,
    name,
    show = true,
    maximumScreenSpaceError = 16,
    maximumMemoryUsage = 512,
    skipLevelOfDetail = false,
    skipScreenSpaceErrorFactor = 16,
    baseScreenSpaceError = 1024,
    skipLevels = 0,
    immediatelyLoadDesiredLevelOfDetail = false,
    loadSiblings = false,
    clippingPlanes,
    modelMatrix,
    heightOffset = TILESET_HEIGHT_OFFSET,
    headers,
  } = options;

  const tilesetOptions = {
    show,
    maximumScreenSpaceError,
    maximumMemoryUsage,
    skipLevelOfDetail,
    skipScreenSpaceErrorFactor,
    baseScreenSpaceError,
    skipLevels,
    immediatelyLoadDesiredLevelOfDetail,
    loadSiblings,
    clippingPlanes,
    modelMatrix,
  };

  // 需要鉴权请求头时用 Resource 包装 URL：tileset 会把它作为根资源，
  // tileset.json、子 tileset、b3dm/i3dm 等内容请求都由它派生
  // （getDerivedResource 会继承 headers），一组头即可覆盖整个数据集。
  const resource = url && headers ? new Cesium.Resource({ url, headers }) : url;

  // 优先使用 Cesium ION assetId，其次直接 URL
  const tileset = ionAssetId
    ? await Cesium.Cesium3DTileset.fromIonAssetId(ionAssetId, tilesetOptions)
    : await Cesium.Cesium3DTileset.fromUrl(resource, tilesetOptions);

  // 加载期间切走路由（viewer 被销毁）：此时 scene 已不可访问，
  // 直接返回 null 交给调用方跳过，避免往已销毁的 viewer 上挂载而抛错
  if (!viewer || viewer.isDestroyed()) return null;

  // 设置默认样式（显示所有要素）
  tileset.style = new Cesium.Cesium3DTileStyle({
    show: "true",
  });

  // 设置图层区分名（如业务图层传入的 name），便于日志与引用区分
  if (name) {
    tileset.name = name;
  }

  // 统一抬升（高度取配置 tilesetHeightOffset，默认 5m），要在加入场景之前设好，
  // 首帧即为抬升后的位置
  applyHeightOffset(tileset, heightOffset);

  viewer.scene.primitives.add(tileset);

  return tileset;
}

/**
 * 移除 3D Tiles 图层
 *
 * @param {Cesium.Viewer} viewer - Cesium Viewer 实例
 * @param {Cesium.Cesium3DTileset} tileset - 要移除的 3D Tiles 数据集实例
 */
export function remove3DTilesLayer(viewer, tileset) {
  viewer.scene.primitives.remove(tileset);
}

/**
 * 设置 3D Tiles 的样式
 *
 * @param {Cesium.Cesium3DTileset} tileset - 3D Tiles 数据集实例
 * @param {object} style - Cesium 3D Tile Style 对象
 * @example
 * set3DTilesStyle(tileset, {
 *   color: "color('cyan')",
 *   show: "${height} > 10",
 * });
 */
export function set3DTilesStyle(tileset, style) {
  tileset.style = new Cesium.Cesium3DTileStyle(style);
}

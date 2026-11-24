import * as Cesium from "cesium";

/**
 * 把配置里的字符串转成 Cesium 的切片方案实例
 *
 * 配置里写字符串（"geographic" / "mercator"）而不是直接构造实例，
 * 因为 public/config/*.js 是运行时加载的纯数据脚本，拿不到 Cesium 命名空间。
 * 已是实例时原样返回，便于代码侧直接传 `new Cesium.GeographicTilingScheme()`。
 *
 * @param {"geographic"|"mercator"|Cesium.TilingScheme} [kind] - 省略时交给 Cesium 用默认值
 * @returns {Cesium.TilingScheme|undefined}
 */
export function resolveTilingScheme(kind) {
  if (!kind) return undefined;
  if (typeof kind !== "string") return kind;

  return kind === "geographic"
    ? new Cesium.GeographicTilingScheme()
    : new Cesium.WebMercatorTilingScheme();
}

/**
 * 按级号偏移量生成 Cesium 需要的 tileMatrixLabels
 *
 * 国产 WMTS 的级号常比 Cesium 的 TilingScheme 大若干级（常见为 +1，即服务从 7 级起编），
 * 不映射时 Cesium 会从 0 级开始请求，服务端全部落空 —— 表现为地球一片空白且无报错。
 *
 * @param {number} maximumLevel - Cesium 侧最大级号
 * @param {number} levelOffset - 服务级号 - Cesium 级号
 * @returns {string[]} labels[cesiumLevel] = 服务级号
 */
function buildTileMatrixLabels(maximumLevel, levelOffset) {
  const length = (maximumLevel ?? 0) + 1;
  return Array.from({ length }, (_, level) => String(level + levelOffset));
}

/**
 * 把配置里的范围转成 Cesium.Rectangle
 *
 * 配置里用数组 [西, 南, 东, 北]（度数），代码侧也可以直接传 Rectangle 实例。
 *
 * @param {[number, number, number, number]|Cesium.Rectangle} [rectangle]
 * @returns {Cesium.Rectangle|undefined}
 */
function toRectangle(rectangle) {
  if (!rectangle) return undefined;
  if (Array.isArray(rectangle))
    return Cesium.Rectangle.fromDegrees(...rectangle);
  return rectangle;
}

/**
 * 构造 WMTS ImageryProvider（不挂到 viewer 上）
 *
 * 只有真正要挂到 viewer 时才用 addWMTSLayer；需要自己组装 ImageryLayer
 * （例如作为 Viewer 的 baseLayer）时用 createWMTSLayer，或直接用本函数。
 *
 * @param {object} options - 同 addWMTSLayer
 * @returns {Cesium.WebMapTileServiceImageryProvider}
 */
export function createWMTSProvider(options) {
  const {
    url,
    // Cesium 在 debug 构建下强制要求 layer / style / tileMatrixSetID 均已定义，
    // 即使是 RESTful 模板（URL 中不含对应占位符、取值实际不会被使用）也要给值，
    // 否则会抛 DeveloperError。
    layer = "default",
    style = "default",
    format = "image/png",
    tileMatrixSetID = "default",
    maximumLevel,
    minimumLevel,
    tileMatrixLabels,
    // 级号偏移量的便捷写法：不给 tileMatrixLabels 时按 maximumLevel + levelOffset 生成
    levelOffset,
    tileWidth = 256,
    tileHeight = 256,
    headers,
    tilingScheme,
    rectangle,
    // 默认关闭 GetFeatureInfo：WMTS 服务普遍不实现该接口，开启后每次点击都会发出
    // 一个注定失败的请求（实测某服务返回 ows:ExceptionReport）
    enablePickFeatures = false,
  } = options;

  // 需要鉴权请求头时用 Resource 包装 URL：provider 内部走
  // Resource.createIfNeeded(options.url)，传入 Resource 可让每个瓦片请求都带上 headers。
  const resource = headers ? new Cesium.Resource({ url, headers }) : url;

  const labels =
    tileMatrixLabels ??
    (levelOffset === undefined
      ? undefined
      : buildTileMatrixLabels(maximumLevel, levelOffset));

  return new Cesium.WebMapTileServiceImageryProvider({
    url: resource,
    layer,
    style,
    format,
    tileMatrixSetID,
    maximumLevel,
    minimumLevel,
    tileMatrixLabels: labels,
    tileWidth,
    tileHeight,
    tilingScheme: resolveTilingScheme(tilingScheme),
    rectangle: toRectangle(rectangle),
    enablePickFeatures,
  });
}

/**
 * 叠加在底图之上的切片服务默认透明度（0.7 = 30% 透明）
 *
 * 切片服务出图通常不透明，一旦上图就把下面的影像底图完全盖住。
 * 业务图层（themeLayer 的 wmts 条目）从这里取默认值，留 30% 透明度以便看到底图。
 *
 * 底图自身不受影响：basemap.js 显式传 `alpha: 1`。
 */
export const TILE_LAYER_ALPHA = 0.7;

/**
 * 构造 WMTS ImageryLayer（不挂到 viewer 上）
 *
 * @param {object} options - 同 addWMTSLayer
 * @returns {Cesium.ImageryLayer}
 */
export function createWMTSLayer(options) {
  const imageryLayer = new Cesium.ImageryLayer(createWMTSProvider(options));

  // 不给 alpha 时用切片服务的默认值（30% 透明），需要不透明就显式传 1
  const alpha = options.alpha ?? TILE_LAYER_ALPHA;
  if (alpha !== 1) {
    imageryLayer.alpha = alpha;
  }

  return imageryLayer;
}

/**
 * WMTS (Web Map Tile Service) 图层加载
 *
 * @param {Cesium.Viewer} viewer - Cesium Viewer 实例
 * @param {object} options - 图层配置
 * @param {string} options.url - WMTS 服务地址（支持 {style}/{TileMatrixSet}/{TileMatrix}/{TileRow}/{TileCol} 通配符）
 * @param {string} [options.layer] - 图层名称
 * @param {string} [options.style='default'] - 样式
 * @param {string} [options.format='image/png'] - 图片格式
 * @param {string} [options.tileMatrixSetID] - 瓦片矩阵集 ID
 * @param {number} [options.maximumLevel] - 最大层级
 * @param {number} [options.minimumLevel] - 最小层级
 * @param {number} [options.alpha=0.7] - 图层透明度 (0-1)，默认 30% 透明（TILE_LAYER_ALPHA），传 1 为不透明
 * @param {object} [options.tileMatrixLabels] - 自定义瓦片矩阵标签数组（优先级高于 levelOffset）
 * @param {number} [options.levelOffset] - 级号偏移量（服务级号 = Cesium 级号 + 该值）。
 *   不给 tileMatrixLabels 时按 maximumLevel 与偏移量自动生成，见 buildTileMatrixLabels。
 * @param {number} [options.tileWidth=256] - 瓦片宽度
 * @param {number} [options.tileHeight=256] - 瓦片高度
 * @param {object} [options.headers] - 附加到每个瓦片请求的请求头（服务鉴权用）
 * @param {"geographic"|"mercator"|Cesium.TilingScheme} [options.tilingScheme] - 瓦片投影方案，默认 Web Mercator
 * @param {[number,number,number,number]|Cesium.Rectangle} [options.rectangle] - 图层覆盖范围 [西,南,东,北]，
 *   超出范围的瓦片不会被请求
 * @param {boolean} [options.enablePickFeatures=false] - 是否启用 GetFeatureInfo。
 *   默认关闭：多数 WMTS 服务并不实现该接口，开启后每次点击都会发出一个注定失败的请求
 *   （实测某服务返回 ows:ExceptionReport）。需要时再显式打开。
 * @returns {Cesium.ImageryLayer} Cesium 影像图层实例
 *
 * @example
 * // RESTful 风格
 * const layer = addWMTSLayer(viewer, {
 *   url: 'https://example.com/wmts/rest/layer/{style}/{TileMatrixSet}/{TileMatrix}/{TileRow}/{TileCol}',
 *   layer: 'mylayer',
 *   style: 'default',
 *   tileMatrixSetID: 'EPSG:4326',
 *   format: 'image/png',
 * });
 *
 * @example
 * // KVP 风格
 * const layer = addWMTSLayer(viewer, {
 *   url: 'https://example.com/wmts?layer=mylayer&style=default&tilematrixset=EPSG:4326&Service=WMTS&Request=GetTile&Version=1.0.0&Format=image/png&TileMatrix={TileMatrix}&TileRow={TileRow}&TileCol={TileCol}',
 *   maximumLevel: 18,
 * });
 */
export function addWMTSLayer(viewer, options) {
  // 注意 ImageryLayerCollection.add() 返回 void，不能拿它的返回值当图层引用
  const imageryLayer = createWMTSLayer(options);
  viewer.imageryLayers.add(imageryLayer);
  return imageryLayer;
}

/**
 * 移除 WMTS 图层
 *
 * @param {Cesium.Viewer} viewer - Cesium Viewer 实例
 * @param {Cesium.ImageryLayer} layer - 要移除的图层实例
 */
export function removeWMTSLayer(viewer, layer) {
  viewer.imageryLayers.remove(layer);
}

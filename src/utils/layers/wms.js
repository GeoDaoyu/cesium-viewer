import * as Cesium from "cesium";

/**
 * WMS (Web Map Service) 图层加载
 *
 * @param {Cesium.Viewer} viewer - Cesium Viewer 实例
 * @param {object} options - 图层配置
 * @param {string} options.url - WMS 服务地址
 * @param {string} options.layers - 图层名称（逗号分隔）
 * @param {object} [options.parameters] - 额外 WMS 参数
 * @param {string} [options.parameters.styles] - 样式
 * @param {string} [options.parameters.format='image/png'] - 图片格式
 * @param {boolean} [options.parameters.transparent=true] - 是否透明
 * @param {string} [options.parameters.version='1.1.1'] - WMS 版本
 * @param {string} [options.parameters.crs] - 坐标参考系
 * @param {string} [options.parameters.srs] - 空间参考系（1.1.1 版本使用）
 * @param {number} [options.alpha=1] - 图层透明度 (0-1)
 * @param {Cesium.Rectangle} [options.rectangle] - 图层范围
 * @param {number} [options.minimumLevel] - 最小缩放级别
 * @param {number} [options.maximumLevel] - 最大缩放级别
 * @returns {Cesium.ImageryLayer} Cesium 影像图层实例
 *
 * @example
 * const layer = addWMSLayer(viewer, {
 *   url: 'https://example.com/geoserver/wms',
 *   layers: 'myworkspace:mylayer',
 *   parameters: { transparent: true, format: 'image/png' },
 * });
 */
export function addWMSLayer(viewer, options) {
  const { url, layers, parameters = {}, alpha = 1, rectangle } = options;

  const provider = new Cesium.WebMapServiceImageryProvider({
    url,
    layers,
    parameters: {
      styles: "",
      format: "image/png",
      transparent: true,
      version: "1.1.1",
      ...parameters,
    },
  });

  const layer = viewer.imageryLayers.addImageryProvider(provider);

  if (alpha !== 1) {
    layer.alpha = alpha;
  }

  if (rectangle) {
    layer.rectangle = rectangle;
  }

  return layer;
}

/**
 * 移除 WMS 图层
 *
 * @param {Cesium.Viewer} viewer - Cesium Viewer 实例
 * @param {Cesium.ImageryLayer} layer - 要移除的图层实例
 */
export function removeWMSLayer(viewer, layer) {
  viewer.imageryLayers.remove(layer);
}

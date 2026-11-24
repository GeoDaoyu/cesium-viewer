import * as Cesium from "cesium";
import { applyDataSourceStyle } from "./geojson";

/**
 * WFS (Web Feature Service) 图层加载
 *
 * 通过 WFS GetFeature 请求获取 GeoJSON，然后加载为 Cesium 矢量数据源。
 * 注意：服务端需要支持 outputFormat=GEOJSON。
 *
 * @param {Cesium.Viewer} viewer - Cesium Viewer 实例
 * @param {object} options - 图层配置
 * @param {string} options.url - WFS 服务地址
 * @param {string} options.typeName - 要素类型名称
 * @param {string} [options.name] - 图层名称，设置后可通过 viewer.dataSources.getByName(name) 获取
 * @param {object} [options.cqlFilter] - CQL 过滤条件
 * @param {string} [options.outputFormat='application/json'] - 输出格式
 * @param {number} [options.maxFeatures] - 最大返回要素数
 * @param {Cesium.Color|string} [options.defaultColor=Cesium.Color.YELLOW] - 默认颜色，支持 Cesium.Color 或 hex 字符串（如 '#ff0000'）
 * @param {number} [options.defaultPointSize=8] - 点要素默认大小
 * @param {number} [options.fillOpacity=0.4] - 多边形填充透明度 (0~1)，默认 0.4
 * @param {number} [options.defaultOutlineWidth=1] - 轮廓线宽度
 * @param {boolean} [options.clampToGround=false] - 是否贴合地面
 * @param {number} [options.zIndex] - 图层 zIndex，用于控制贴合地面时的渲染顺序，数值越大越靠上
 * @param {number} [options.height] - 多边形绝对高度（米），用于分离重叠图层的深度以避免 z-fighting
 * @returns {Promise<Cesium.GeoJsonDataSource|null>} GeoJSON 数据源实例；viewer 不可用/已销毁时返回 null
 *
 * @example
 * const dataSource = await addWFSLayer(viewer, {
 *   url: 'https://example.com/geoserver/wfs',
 *   typeName: 'myworkspace:mylayer',
 *   cqlFilter: "population > 1000000",
 *   defaultColor: '#3388ff',
 * });
 */
export async function addWFSLayer(viewer, options) {
  // 快速失败：路由切换时旧 viewer 会被销毁、新 viewer 尚未就绪，
  // 此时直接返回，避免发起无效请求
  if (!viewer || viewer.isDestroyed()) {
    return null;
  }

  const {
    url,
    typeName,
    name,
    cqlFilter,
    outputFormat = "GEOJSON",
    maxFeatures,
    defaultColor = Cesium.Color.YELLOW,
    fillOpacity = 0.4,
    defaultPointSize = 8,
    defaultOutlineWidth = 1,
    clampToGround = false,
    zIndex,
    height,
  } = options;

  // 构建 WFS GetFeature 请求参数
  const params = new URLSearchParams({
    service: "WFS",
    version: "2.0.0",
    request: "GetFeature",
    typeNames: typeName,
    outputFormat,
  });

  if (cqlFilter) {
    // WFS 2.0 使用 cql_filter，1.1.0 使用 CQL_FILTER
    params.set("cql_filter", cqlFilter);
  }

  if (maxFeatures) {
    params.set("count", String(maxFeatures));
  }

  const requestUrl = `${url}?${params.toString()}`;

  const dataSource = await Cesium.GeoJsonDataSource.load(requestUrl, {
    clampToGround,
  });

  // 异步加载期间 viewer 可能已被销毁（如路由切换、旧页面卸载），
  // 此时不能再访问 viewer.dataSources，否则会抛 TypeError。
  // 数据源对象本身已解析完成，直接返回但不挂载到 viewer。
  if (viewer.isDestroyed()) {
    return dataSource;
  }

  // 设置默认样式（与前端 GeoJSON 图层共用一套样式规则）
  applyDataSourceStyle(dataSource, {
    defaultColor,
    fillOpacity,
    defaultPointSize,
    defaultOutlineWidth,
    zIndex,
    height,
  });

  if (name) {
    dataSource.name = name;
  }
  viewer.dataSources.add(dataSource);

  return dataSource;
}

/**
 * 移除 WFS 图层
 *
 * @param {Cesium.Viewer} viewer - Cesium Viewer 实例
 * @param {Cesium.GeoJsonDataSource} dataSource - 要移除的数据源实例
 */
export function removeWFSLayer(viewer, dataSource) {
  viewer.dataSources.remove(dataSource);
}

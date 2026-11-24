// 运行时配置

// 全局初始化数据配置，用于 Layout 用户信息和权限初始化
// 更多信息见文档：https://umijs.org/docs/api/runtime-config#getinitialstate
export async function getInitialState() {
  return {
    appName: "Cesium Viewer",
    cesiumReady: false,
  };
}

export const request = {
  // 请求拦截器
  requestInterceptors: [],
  // 响应拦截器
  responseInterceptors: [],
};

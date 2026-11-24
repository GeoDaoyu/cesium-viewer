/**
 * 专题图层选项（平铺数组）→ antd TreeSelect 的树数据
 *
 * 选项表在 `public/config/app.js`，树形由三个字段决定：
 *
 *   group     父节点标题。同组条目聚成一个父节点，组顺序按在数组里**首次出现的顺序**；
 *             没有 group 的条目直接作为根叶子。
 *   year      组内排序用的年份。同一组内按年份**倒序**，没有 year 的条目排在组末，
 *             同年保持配置里的先后顺序。
 *   children  现成的子树（条目自己就是一个分组）。按原结构递归搭树、父节点不可选。
 *             嵌套条目不再参与 group / year 聚合。
 *
 * 交给 TreeSelect 的节点只保留 title / value / children，**不把配置条目原样塞进去**：
 * WMTS 条目的 `style` 是样式名，antd 会把它当成 CSS 样式展开成
 * {0:"d",1:"e",...}，React 写 style["0"] 时整页白屏。
 *
 * @param {Array<object>} options - 选项数组
 * @returns {Array<object>} TreeSelect 的 treeData
 */
export function buildThemeTree(options = []) {
  const nodes = [];
  const groupNodes = new Map();

  for (const option of options) {
    // 占位项（value 为空）不进树
    if (!option || !option.value) continue;

    // 现成的子树：整棵递归进来，父节点只做分组（空分组直接丢掉）
    if (option.children?.length) {
      const children = buildThemeTree(option.children);
      if (!children.length) continue;

      nodes.push({
        title: option.label || option.value,
        value: `group:${option.value}`,
        selectable: false,
        children,
      });
      continue;
    }

    const leaf = {
      title: option.label || option.value,
      value: option.value,
      isLeaf: true,
    };

    if (!option.group) {
      nodes.push(leaf);
      continue;
    }

    let group = groupNodes.get(option.group);
    if (!group) {
      group = {
        title: option.group,
        value: `group:${option.group}`,
        selectable: false,
        children: [],
      };
      groupNodes.set(option.group, group);
      nodes.push(group);
    }

    const year = Number(option.year);
    group.children.push({
      ...leaf,
      year: Number.isFinite(year) ? year : null,
    });
  }

  for (const node of nodes) {
    if (!node.children) continue;

    node.children.sort((a, b) => {
      const yearA = a.year ?? -Infinity;
      const yearB = b.year ?? -Infinity;
      if (yearA === yearB) return 0;
      return yearB - yearA;
    });
    for (const child of node.children) delete child.year;
  }

  return nodes;
}

/**
 * 选项表拍平（只取可加载的叶子）
 *
 * 选项可以是嵌套的（分组条目带 children），而「value → 选项」查表、默认值解析、
 * 首项兜底都只关心叶子。分组条目本身不参与勾选，不进结果。
 *
 * @param {Array<object>} options - 选项数组（可嵌套）
 * @param {Array<object>} [result] - 递归累加用，调用方不用传
 * @returns {Array<object>} 叶子选项的平铺数组
 */
export function flattenThemeOptions(options = [], result = []) {
  for (const option of options) {
    if (!option?.value) continue;

    if (option.children?.length) {
      flattenThemeOptions(option.children, result);
    } else {
      result.push(option);
    }
  }

  return result;
}

/**
 * 解析默认勾选项
 *
 * 配置数组里的元素既可以是选项的 `value`，也可以是 WMTS 条目的 `serverName`，
 * 按顺序匹配；匹配不到时告警并跳过，重复项去重。
 *
 * @param {Array<object>} options - 叶子选项数组
 * @param {Array<string>} defaults - themeDefaults 配置
 * @returns {string[]} 可直接作为 TreeSelect value 的数组
 */
export function resolveDefaultValues(options = [], defaults = []) {
  if (!Array.isArray(defaults) || defaults.length === 0) return [];

  const byValue = new Map();
  const byServerName = new Map();
  for (const option of options) {
    if (!option?.value) continue;
    byValue.set(option.value, option);
    if (option.serverName) byServerName.set(option.serverName, option);
  }

  const values = [];
  for (const entry of defaults) {
    const option = byValue.get(entry) || byServerName.get(entry);

    if (!option?.value) {
      console.warn(
        `[ThemeSwitcher] themeDefaults 里的「${entry}」未在 themeOptions 中找到`,
      );
      continue;
    }

    if (!values.includes(option.value)) values.push(option.value);
  }

  return values;
}

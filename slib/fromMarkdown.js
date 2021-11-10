export default function fromMarkdown(markdown) {
  const unFlatObj = (obj) => {
    const result = {};
    Object.entries(obj).forEach(([keyPath, v]) => {
      const keys = keyPath.split(".");
      let r = result;
      keys.slice(0, -1).forEach((k) => {
        if (typeof r[k] !== "object") r[k] = {};
        r = r[k];
      });
      const key = keys[keys.length - 1];
      if (key.slice(-4) === "List")
        r[key.slice(0, -4)] = v.split(",").map((s) => s.trim());
      else r[key] = v;
    });
    return result;
  };
  const front = markdown.match(/---\n([\s\S]*?)\n---\n/m);
  if (!front) return { content: markdown };
  const vars = front[1].split("\n");
  const props = {};
  // eslint-disable-next-line no-plusplus
  for (let i = 0; i < vars.length; i++) {
    const [, key] = vars[i].match(/^(\S*?):/) || [];
    if (!key) return null; // invalid font matter
    const [, v] = vars[i].match(/:\s*(.*)$/) || [undefined, ""];
    props[key] = v;
  }
  return {
    ...unFlatObj(props),
    content: markdown.slice(front[0].length),
  };
}

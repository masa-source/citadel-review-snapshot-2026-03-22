/**
 * Toposort algorithm implementation.
 * Ported/adapted for simple array sorting.
 */
export function toposort(nodes, edges) {
  let cursor = nodes.length;
  const sorted = new Array(cursor);
  const visited = {};
  const i = cursor;

  function visit(node, i, predecessors) {
    if (predecessors.indexOf(node) >= 0) {
      throw new Error("Cyclic dependency: " + JSON.stringify(node));
    }

    if (!~nodes.indexOf(node)) {
      throw new Error(
        `Found unknown node. Make sure to provided all involved nodes. Unknown node: ${JSON.stringify(node)}, Available nodes: ${JSON.stringify(nodes)}`
      );
    }

    if (visited[i]) return;
    visited[i] = true;

    // outgoing edges
    const outgoing = edges.filter((edge) => edge[0] === node);
    if ((i = outgoing.length)) {
      const preds = predecessors.concat(node);
      do {
        const child = outgoing[--i][1];
        visit(child, nodes.indexOf(child), preds);
      } while (i);
    }

    sorted[--cursor] = node;
  }

  // 最初に呼ばれる時は predecessor は空配列。
  // また i は 0 から nodes.length-1 まで進める
  for (let idx = 0; idx < nodes.length; idx++) {
    if (!visited[idx]) visit(nodes[idx], idx, []);
  }

  return sorted;
}

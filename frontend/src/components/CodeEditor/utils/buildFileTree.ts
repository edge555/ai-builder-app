export interface TreeNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  children?: TreeNode[];
}

export function buildFileTree(files: Record<string, string>): TreeNode[] {
  const root: TreeNode[] = [];
  const dirMap = new Map<string, TreeNode>();

  const getOrCreateDir = (dirPath: string): TreeNode => {
    const existing = dirMap.get(dirPath);
    if (existing) return existing;

    const parts = dirPath.split('/');
    const name = parts[parts.length - 1];
    const node: TreeNode = { name, path: dirPath, type: 'directory', children: [] };
    dirMap.set(dirPath, node);

    if (parts.length === 1) {
      root.push(node);
    } else {
      const parentPath = parts.slice(0, -1).join('/');
      const parent = getOrCreateDir(parentPath);
      parent.children!.push(node);
    }

    return node;
  };

  for (const filePath of Object.keys(files)) {
    const parts = filePath.split('/');
    const fileName = parts[parts.length - 1];
    const fileNode: TreeNode = { name: fileName, path: filePath, type: 'file' };

    if (parts.length === 1) {
      root.push(fileNode);
    } else {
      const dirPath = parts.slice(0, -1).join('/');
      const parent = getOrCreateDir(dirPath);
      parent.children!.push(fileNode);
    }
  }

  const sortNodes = (nodes: TreeNode[]): TreeNode[] => {
    nodes.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    for (const node of nodes) {
      if (node.children) sortNodes(node.children);
    }
    return nodes;
  };

  return sortNodes(root);
}

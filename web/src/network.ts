import cytoscape, { type Core, type StylesheetJson, type EventObject } from 'cytoscape';
import type { Theme } from './theme';
import { formatKzt, type Gid, type GraphResponse, type Role } from './domain';

export function networkStyleFor(theme: Theme): StylesheetJson {
  const dark = theme === 'dark';
  const colors: Record<Role, string> = dark
    ? { consolidator: '#8BB5E7', transit: '#66CC9A', distributor: '#BDA7E5', terminal: '#EBCB89', coordinator: '#DFABC9', peripheral: '#A8B5A8' }
    : { consolidator: '#346996', transit: '#23743A', distributor: '#74529E', terminal: '#80570E', coordinator: '#99506F', peripheral: '#5B6C5E' };
  const text = dark ? '#ECF1E9' : '#274030';
  const accent = dark ? '#7CD577' : '#23743A';
  return [
    { selector: 'node', style: { 'background-color': colors.peripheral, width: 'data(size)', height: 'data(size)', label: 'data(shortLabel)', color: text, 'font-size': 12, 'font-family': '-apple-system, BlinkMacSystemFont, sans-serif', 'text-valign': 'bottom', 'text-margin-y': 8, 'border-width': 1, 'border-color': dark ? '#A5B4A2' : '#546F55' } },
    ...Object.entries(colors).map(([role, color]) => ({ selector: `node[role = "${role}"]`, style: { 'background-color': color } })),
    { selector: '.cluster', style: { shape: 'round-rectangle', width: 66, height: 38, 'font-size': 12, 'background-color': dark ? '#344637' : '#DCEAD5', color: text, 'text-valign': 'center', 'text-margin-y': 0, 'text-wrap': 'wrap', 'border-width': 0 } },
    { selector: '.seed', style: { 'border-width': 4, 'border-color': dark ? '#E4EEDF' : '#36543B' } },
    { selector: '.boundary', style: { 'border-width': 3, 'border-color': dark ? '#EBCB89' : '#80570E', 'border-style': 'dashed' } },
    { selector: '.active', style: { 'border-width': 4, 'border-color': accent, 'overlay-opacity': 0, 'font-weight': 'bold', 'font-size': 13 } },
    { selector: 'edge', style: { width: 'data(width)', 'curve-style': 'bezier', 'line-color': dark ? '#6E8774' : '#657C68', 'target-arrow-color': dark ? '#A3B9A7' : '#5E7860', 'target-arrow-shape': 'triangle', 'arrow-scale': 1.3, opacity: .85 } },
    { selector: 'edge:selected', style: { 'line-color': accent, 'target-arrow-color': accent, label: 'data(label)', 'text-wrap': 'wrap', 'font-size': 11, color: text, 'text-background-color': dark ? '#101810' : '#F8FBF6', 'text-background-opacity': 1, 'text-background-padding': '4px' } },
  ];
}
export const networkStyle = networkStyleFor('dark');

export function applyNetworkTheme(cy: Core, theme: Theme) {
  // Update only renderer styles: preserve the graph, selection, layout and viewport.
  cy.style(networkStyleFor(theme));
}

export function fitNetwork(cy: Core) {
  cy.resize(); cy.fit(undefined, 40);
  if (cy.zoom() > 1.1) { cy.zoom(1.1); cy.center(); }
}

export function updateNetwork(cy: Core, graph: GraphResponse, selected: Gid | null) {
  cy.batch(() => {
    cy.elements().remove();
    cy.add(graph.nodes.map((n, index) => ({ data: { ...n, size: 16 + 20 * (n.priority_score ?? 0), shortLabel: n.kind === 'cluster' ? `№ ${n.cluster_id}\n${n.n_nodes} узл.` : `…${n.gid!.slice(-6)}` }, position: { x: 35 * Math.sqrt(index) * Math.cos(index * 2.399963), y: 35 * Math.sqrt(index) * Math.sin(index * 2.399963) }, classes: [n.kind === 'cluster' ? 'cluster' : '', n.is_seed ? 'seed' : '', n.boundary ? 'boundary' : '', n.gid === selected ? 'active' : ''].join(' ') })));
    cy.add(graph.edges.map(e => ({ data: { ...e, width: Math.min(5, Math.max(1, Math.log1p(Number(e.sum_kzt)) / 4)), label: `${formatKzt(e.sum_kzt)}\n${e.n_tx} переводов` } })));
  });
  if (!cy.container()) return;
  // Only layout distances are computed here; financial/role calculations stay on the API.
  if (selected && graph.scope.mode === 'ego' && graph.nodes.length <= 10) {
    const distances = new Map<string, number>();
    cy.elements().bfs({ roots: cy.getElementById(`n:${selected}`), directed: false, visit: (node, _edge, _previous, _index, depth) => { distances.set(node.id(), depth); } });
    cy.layout({ name: 'concentric', animate: false, padding: 30, minNodeSpacing: 90, fit: true,
      concentric: node => 100 - (distances.get(node.id()) ?? 99), levelWidth: () => 1,
      nodeDimensionsIncludeLabels: true, sort: (a, b) => a.id().localeCompare(b.id()),
    }).run();
  } else {
    cy.layout({ name: 'cose', animate: false, randomize: false, padding: 40, nodeDimensionsIncludeLabels: true,
      numIter: 400, idealEdgeLength: () => 80, nodeRepulsion: () => 6000, componentSpacing: 60,
    }).run();
  }
  fitNetwork(cy);
}

export function createNetwork(container: HTMLElement | undefined, select: (gid: Gid) => void, cluster: (id: number) => void, theme: Theme = 'dark') {
  const cy = cytoscape({ container, headless: !container, styleEnabled: true, style: networkStyleFor(theme), elements: [], layout: { name: 'preset' }, minZoom: .15, maxZoom: 4, boxSelectionEnabled: false });
  const tapped = (event: EventObject) => {
    const node = event.target;
    if (node.data('kind') === 'cluster') cluster(node.data('cluster_id'));
    else select(node.data('gid'));
  };
  cy.on('tap', 'node', tapped);
  let disposed = false;
  return { cy, dispose() {
    if (disposed) return; disposed = true;
    cy.off('tap', 'node', tapped); cy.removeAllListeners(); cy.destroy();
  } };
}

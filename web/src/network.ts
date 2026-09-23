import cytoscape, { type Core, type StylesheetJson, type EventObject } from 'cytoscape';
import { formatKzt, type Gid, type GraphResponse, type Role } from './domain';

const colors: Record<Role, string> = { consolidator: '#9BBECF', transit: '#9ACDB7', distributor: '#B8ADCA', terminal: '#D9BD87', coordinator: '#CAA9B5', peripheral: '#9DAEA8' };
export const networkStyle: StylesheetJson = [
  { selector: 'node', style: { 'background-color': 'data(color)', width: 'data(size)', height: 'data(size)', label: 'data(shortLabel)', color: '#E6EFEB', 'font-size': 12, 'font-family': '-apple-system, BlinkMacSystemFont, sans-serif', 'text-valign': 'bottom', 'text-margin-y': 8, 'border-width': 1, 'border-color': '#B5CDC2' } },
  { selector: '.cluster', style: { shape: 'round-rectangle', width: 66, height: 38, 'font-size': 12, 'background-color': '#B4C9BE', color: '#173832', 'text-valign': 'center', 'text-margin-y': 0, 'text-wrap': 'wrap', 'border-width': 0 } },
  { selector: '.seed', style: { 'border-width': 4, 'border-color': '#EDF3EE' } },
  { selector: '.boundary', style: { 'border-width': 3, 'border-color': '#E2BF79', 'border-style': 'dashed' } },
  { selector: '.active', style: { 'border-width': 4, 'border-color': '#FFFFFF', 'overlay-opacity': 0, 'font-weight': 'bold', 'font-size': 13 } },
  { selector: 'edge', style: { width: 'data(width)', 'curve-style': 'bezier', 'line-color': '#75958C', 'target-arrow-color': '#A2BCB3', 'target-arrow-shape': 'triangle', 'arrow-scale': 1.3, opacity: .85 } },
  { selector: 'edge:selected', style: { 'line-color': '#B4D7BA', 'target-arrow-color': '#B4D7BA', label: 'data(label)', 'text-wrap': 'wrap', 'font-size': 11, color: '#E6EFEB', 'text-background-color': '#1B3032', 'text-background-opacity': 1, 'text-background-padding': '4px' } },
];

export function fitNetwork(cy: Core) {
  cy.resize(); cy.fit(undefined, 40);
  if (cy.zoom() > 1.1) { cy.zoom(1.1); cy.center(); }
}

export function updateNetwork(cy: Core, graph: GraphResponse, selected: Gid | null) {
  cy.batch(() => {
    cy.elements().remove();
    cy.add(graph.nodes.map((n, index) => ({ data: { ...n, color: n.role ? colors[n.role] : '#9DAEA8', size: 16 + 20 * (n.priority_score ?? 0), shortLabel: n.kind === 'cluster' ? `№ ${n.cluster_id}\n${n.n_nodes} узл.` : `…${n.gid!.slice(-6)}` }, position: { x: 35 * Math.sqrt(index) * Math.cos(index * 2.399963), y: 35 * Math.sqrt(index) * Math.sin(index * 2.399963) }, classes: [n.kind === 'cluster' ? 'cluster' : '', n.is_seed ? 'seed' : '', n.boundary ? 'boundary' : '', n.gid === selected ? 'active' : ''].join(' ') })));
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

export function createNetwork(container: HTMLElement | undefined, select: (gid: Gid) => void, cluster: (id: number) => void) {
  const cy = cytoscape({ container, headless: !container, style: networkStyle, elements: [], layout: { name: 'preset' }, minZoom: .15, maxZoom: 4, boxSelectionEnabled: false });
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

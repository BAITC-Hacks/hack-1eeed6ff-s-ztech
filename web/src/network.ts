import cytoscape, { type Core, type StylesheetJson, type EventObject } from 'cytoscape';
import { formatKzt, type Gid, type GraphResponse, type Role } from './domain';

const colors: Record<Role, string> = { consolidator: '#78B7FF', transit: '#6CD4C5', distributor: '#B8A1FF', terminal: '#E8B86C', coordinator: '#EEA8D0', peripheral: '#91A1B2' };
export const networkStyle: StylesheetJson = [
  { selector: 'node', style: { 'background-color': 'data(color)', width: 'data(size)', height: 'data(size)', label: 'data(shortLabel)', color: '#EDF3F8', 'font-size': 10, 'text-valign': 'bottom', 'text-margin-y': 8, 'border-width': 1, 'border-color': '#617587' } },
  { selector: '.cluster', style: { shape: 'round-rectangle', width: 58, height: 38, 'font-size': 12 } },
  { selector: '.seed', style: { 'border-width': 4, 'border-color': '#EDF3F8' } },
  { selector: '.boundary', style: { 'border-width': 3, 'border-color': '#E8B86C', 'border-style': 'dashed' } },
  { selector: '.active', style: { 'border-width': 4, 'border-color': '#6CD4C5', 'overlay-opacity': 0 } },
  { selector: 'edge', style: { width: 'data(width)', 'curve-style': 'bezier', 'line-color': '#788D9F', 'target-arrow-color': '#788D9F', 'target-arrow-shape': 'triangle', 'arrow-scale': 1.3, opacity: .8 } },
  { selector: 'edge:selected', style: { 'line-color': '#6CD4C5', 'target-arrow-color': '#6CD4C5', label: 'data(label)', 'text-wrap': 'wrap', 'font-size': 11, color: '#EDF3F8', 'text-background-color': '#121A24', 'text-background-opacity': 1, 'text-background-padding': '4px' } },
];

export function fitNetwork(cy: Core) {
  cy.resize(); cy.fit(undefined, 40);
  if (cy.zoom() > 1.1) { cy.zoom(1.1); cy.center(); }
}

export function updateNetwork(cy: Core, graph: GraphResponse, selected: Gid | null) {
  cy.batch(() => {
    cy.elements().remove();
    cy.add(graph.nodes.map(n => ({ data: { ...n, color: n.role ? colors[n.role] : '#788D9F', size: 14 + 20 * (n.priority_score ?? 0), shortLabel: n.kind === 'cluster' ? `Кластер ${n.cluster_id}` : `…${n.gid!.slice(-6)}` }, classes: [n.kind === 'cluster' ? 'cluster' : '', n.is_seed ? 'seed' : '', n.boundary ? 'boundary' : '', n.gid === selected ? 'active' : ''].join(' ') })));
    cy.add(graph.edges.map(e => ({ data: { ...e, width: Math.min(5, Math.max(1, Math.log1p(Number(e.sum_kzt)) / 4)), label: `${formatKzt(e.sum_kzt)}\n${e.n_tx} переводов` } })));
  });
  if (!cy.container()) return;
  // Only layout distances are computed here; financial/role calculations stay on the API.
  const distances = new Map<string, number>();
  if (selected) cy.elements().bfs({ roots: cy.getElementById(`n:${selected}`), directed: false, visit: (node, _edge, _previous, _index, depth) => { distances.set(node.id(), depth); } });
  cy.layout({ name: 'concentric', animate: false, padding: 30, minNodeSpacing: graph.nodes.length > 10 ? 10 : 35, fit: true,
    concentric: node => selected ? 100 - (distances.get(node.id()) ?? 99) : node.degree(),
    levelWidth: () => 1, nodeDimensionsIncludeLabels: true,
    sort: (a, b) => a.id().localeCompare(b.id()),
  }).run();
  fitNetwork(cy);
}

export function createNetwork(container: HTMLElement | undefined, select: (gid: Gid) => void, cluster: (id: number) => void) {
  const cy = cytoscape({ container, headless: !container, style: networkStyle, elements: [], layout: { name: 'preset' }, minZoom: .15, maxZoom: 4, wheelSensitivity: .25, boxSelectionEnabled: false });
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

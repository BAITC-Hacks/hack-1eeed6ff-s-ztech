import cytoscape, { type Core, type StylesheetJson, type EventObject, type NodeSingular, type EdgeSingular } from 'cytoscape';
import type { Theme } from './theme';
import { formatKzt, roleLabels, type Gid, type GraphResponse, type Role } from './domain';

export function networkStyleFor(theme: Theme): StylesheetJson {
  const dark = theme === 'dark';
  const colors: Record<Role, string> = dark
    ? { consolidator: '#8BB5E7', transit: '#66CC9A', distributor: '#BDA7E5', terminal: '#EBCB89', coordinator: '#DFABC9', peripheral: '#A8B5A8' }
    : { consolidator: '#346996', transit: '#23743A', distributor: '#74529E', terminal: '#80570E', coordinator: '#99506F', peripheral: '#5B6C5E' };
  const text = dark ? '#ECF1E9' : '#274030';
  const accent = dark ? '#7CD577' : '#23743A';
  return [
    { selector: 'node', style: { 'background-color': colors.peripheral, width: 'data(size)', height: 'data(size)', label: 'data(shortLabel)', color: text, 'font-size': 13, 'min-zoomed-font-size': 10, 'font-family': '-apple-system, BlinkMacSystemFont, sans-serif', 'text-valign': 'bottom', 'text-margin-y': 8, 'border-width': 1, 'border-color': dark ? '#A5B4A2' : '#546F55' } },
    ...Object.entries(colors).map(([role, color]) => ({ selector: `node[role = "${role}"]`, style: { 'background-color': color } })),
    { selector: '.cluster', style: { shape: 'round-rectangle', width: 86, height: 50, 'font-size': 16, 'min-zoomed-font-size': 0, 'background-color': dark ? '#344637' : '#DCEAD5', color: text, 'text-valign': 'center', 'text-margin-y': 0, 'text-wrap': 'wrap', 'border-width': 0 } },
    { selector: '.seed', style: { 'border-width': 4, 'border-color': dark ? '#E4EEDF' : '#36543B' } },
    { selector: '.boundary', style: { 'border-width': 3, 'border-color': dark ? '#EBCB89' : '#80570E', 'border-style': 'dashed' } },
    { selector: '.active', style: { 'border-width': 4, 'border-color': accent, 'overlay-opacity': 0, 'font-weight': 'bold', 'font-size': 13 } },
    { selector: 'edge', style: { width: 'data(width)', 'curve-style': 'bezier', 'line-color': dark ? '#6E8774' : '#657C68', 'target-arrow-color': dark ? '#A3B9A7' : '#5E7860', 'target-arrow-shape': 'triangle', 'arrow-scale': 1.3, opacity: .85 } },
    { selector: '.faded', style: { opacity: .13 } },
    { selector: 'node.faded', style: { opacity: 1, 'background-color': dark ? '#29352B' : '#EDF3E9', 'border-opacity': .55 } },
    { selector: 'node.low-detail:not(.active):not(.hovered):not(.all-labels)', style: { label: '' } },
    { selector: 'edge.focused', style: { opacity: 1, 'line-color': accent, 'target-arrow-color': accent } },
    { selector: 'node.focused', style: { 'border-width': 3, 'border-color': accent } },
    { selector: 'node.hovered, node.active, node.all-labels', style: { 'min-zoomed-font-size': 0 } },
    { selector: 'node.hovered', style: { 'text-background-color': dark ? '#19221A' : '#FFFFFF', 'text-background-opacity': 1, 'text-background-padding': '3px', 'z-index': 20 } },
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

export function updateNetwork(cy: Core, graph: GraphResponse, selected: Gid | null, layout: 'network' | 'grid' = 'network') {
  cy.batch(() => {
    cy.elements().remove();
    cy.add(graph.nodes.map((n, index) => ({ data: { ...n, size: 16 + 20 * (n.priority_score ?? 0), shortLabel: n.kind === 'cluster' ? `№ ${n.cluster_id}\n${n.n_nodes} узл.` : `…${n.gid!.slice(-6)}` }, position: { x: 35 * Math.sqrt(index) * Math.cos(index * 2.399963), y: 35 * Math.sqrt(index) * Math.sin(index * 2.399963) }, classes: [n.kind === 'cluster' ? 'cluster' : '', n.is_seed ? 'seed' : '', n.boundary ? 'boundary' : '', n.gid !== null && n.gid === selected ? 'active' : ''].join(' ') })));
    cy.add(graph.edges.map(e => ({ data: { ...e, width: Math.min(5, Math.max(1, Math.log1p(Number(e.sum_kzt)) / 4)), label: `${formatKzt(e.sum_kzt)}\n${e.n_tx} переводов` } })));
  });
  if (!cy.container()) return;
  // Only layout distances are computed here; financial/role calculations stay on the API.
  if (graph.scope.mode === 'overview' && layout === 'grid') {
    cy.layout({ name: 'grid', animate: false, fit: false, avoidOverlap: true, avoidOverlapPadding: 16, nodeDimensionsIncludeLabels: true, condense: true, sort: (a,b) => b.degree(false) - a.degree(false) || a.data('cluster_id') - b.data('cluster_id') }).run();
  } else if (selected && graph.scope.mode === 'ego' && graph.nodes.length <= 10) {
    const distances = new Map<string, number>();
    cy.elements().bfs({ roots: cy.getElementById(`n:${selected}`), directed: false, visit: (node, _edge, _previous, _index, depth) => { distances.set(node.id(), depth); } });
    cy.layout({ name: 'concentric', animate: false, padding: 30, minNodeSpacing: 90, fit: true,
      concentric: node => 100 - (distances.get(node.id()) ?? 99), levelWidth: () => 1,
      nodeDimensionsIncludeLabels: true, sort: (a, b) => a.id().localeCompare(b.id()),
    }).run();
  } else {
    cy.layout({ name: 'cose', animate: false, randomize: false, padding: 40, nodeDimensionsIncludeLabels: true,
      numIter: 700, idealEdgeLength: () => graph.scope.mode === 'overview' ? 125 : 80, nodeRepulsion: () => graph.scope.mode === 'overview' ? 22000 : 6000, nodeOverlap: 20, componentSpacing: 90,
    }).run();
  }
  if (graph.scope.mode === 'overview' && layout === 'network') {
    const linked = cy.nodes().filter(node => node.degree(false) > 0);
    const isolates = cy.nodes().filter(node => node.degree(false) === 0);
    if (linked.length && isolates.length) {
      // Keep disconnected clusters visible in a compact block, not long rows that shrink the whole graph.
      const bounds = linked.boundingBox({ includeLabels: false });
      const columns = Math.max(1, Math.min(isolates.length, Math.floor(bounds.w / 100)));
      isolates.forEach((node, index) => { node.position({ x: bounds.x1 + 40 + (index % columns) * 100, y: bounds.y2 + 90 + Math.floor(index / columns) * 65 }); });
    }
  }
  fitNetwork(cy);
}

export function zoomNetwork(cy: Core, factor: number) {
  const level = Math.min(cy.maxZoom(), Math.max(cy.minZoom(), cy.zoom() * factor));
  cy.zoom({ level, renderedPosition: { x: cy.width() / 2, y: cy.height() / 2 } });
}
export function focusNetwork(cy: Core, id: string | null) {
  cy.batch(() => {
    cy.elements().removeClass('faded focused');
    if (!id) return;
    const node = cy.getElementById(id);
    if (!node.length || !node.isNode()) return;
    const neighborhood = node.closedNeighborhood();
    cy.elements().not(neighborhood).addClass('faded');
    neighborhood.addClass('focused');
  });
}
export function labelNetwork(cy: Core, all: boolean) { cy.nodes().toggleClass('all-labels', all); }
export function detailNetwork(cy: Core) {
  const clusters = cy.nodes('.cluster');
  cy.nodes().toggleClass('low-detail', cy.zoom() < (clusters.length ? .3 : .77));
  // Keep overview captions legible in CSS pixels without changing data or positions.
  clusters.style('font-size', Math.min(26, Math.max(16, 11 / cy.zoom())));
}
export function describeElement(element: NodeSingular | EdgeSingular) {
  const data = element.data();
  if (element.isEdge()) {
    const name = (id: string) => id.startsWith('c:') ? `Кластер ${id.slice(2)}` : id.slice(2);
    return `${name(data.source)} → ${name(data.target)} · ${formatKzt(data.sum_kzt)} · ${data.n_tx} переводов`;
  }
  return data.kind === 'cluster' ? `Кластер ${data.cluster_id} · ${data.n_nodes} узлов` : `${data.gid} · ${roleLabels[data.role as Role]}${data.boundary ? ' · Граница выборки' : ''}${data.is_seed ? ' · Seed' : ''}`;
}

export function createNetwork(container: HTMLElement | undefined, select: (gid: Gid) => void, cluster: (id: number) => void, theme: Theme = 'dark', inspect: (text: string | null) => void = () => {}) {
  const cy = cytoscape({ container, headless: !container, styleEnabled: true, style: networkStyleFor(theme), elements: [], layout: { name: 'preset' }, minZoom: .15, maxZoom: 4, boxSelectionEnabled: false });
  const tapped = (event: EventObject) => {
    const node = event.target;
    if (node.data('kind') === 'cluster') cluster(node.data('cluster_id'));
    else select(node.data('gid'));
  };
  const over = (event: EventObject) => { event.target.addClass('hovered'); inspect(describeElement(event.target)); };
  const out = (event: EventObject) => { event.target.removeClass('hovered'); inspect(null); };
  cy.on('tap', 'node', tapped);
  cy.on('mouseover', 'node, edge', over); cy.on('mouseout', 'node, edge', out);
  let disposed = false;
  return { cy, dispose() {
    if (disposed) return; disposed = true;
    cy.off('tap', 'node', tapped); cy.removeAllListeners(); cy.destroy();
  } };
}

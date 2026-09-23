import { describe, expect, it, vi } from 'vitest';
import fixture from '../../contracts/v1.example.json';
import { parseGraph } from './contract';
import { applyNetworkTheme, createNetwork, networkStyle, updateNetwork } from './network';

describe('Cytoscape ownership and directions', () => {
  it('keeps exact endpoints, boundary and active classes, and binds click selection', () => {
    const select = vi.fn(); const cluster = vi.fn(); const instance = createNetwork(undefined, select, cluster);
    const graph = parseGraph(fixture.graph); updateNetwork(instance.cy, graph, fixture.node_detail.gid);
    const edge = instance.cy.edges().first();
    expect(edge.source().id()).toBe('n:900000000000000001'); expect(edge.target().id()).toBe('n:900000000000000002');
    const root = instance.cy.getElementById(`n:${fixture.node_detail.gid}`);
    expect(root.hasClass('active')).toBe(true); expect(root.hasClass('boundary')).toBe(true);
    root.emit('tap'); expect(select).toHaveBeenCalledWith('900000000000000002');
    expect(networkStyle.find(style => style.selector === 'edge')).toMatchObject({ style: { 'target-arrow-shape': 'triangle' } });
    instance.dispose(); expect(instance.cy.destroyed()).toBe(true); root.emit('tap'); expect(select).toHaveBeenCalledTimes(1);
    instance.dispose();
  });
  it('retains an isolated seed and replaces old graph elements on refresh', () => {
    const instance = createNetwork(undefined, vi.fn(), vi.fn());
    updateNetwork(instance.cy, parseGraph(fixture.graph), fixture.node_detail.gid);
    const id = '900000000000000003';
    const isolated = parseGraph({ ...fixture.graph, scope: { mode: 'ego', gid: id, hops: 1 }, nodes: [{ ...fixture.graph.nodes[0], id: `n:${id}`, gid: id, is_seed: true }], edges: [], counts: { shown_nodes: 1, matched_nodes: 1, shown_edges: 0, matched_edges: 0 } });
    updateNetwork(instance.cy, isolated, id);
    expect(instance.cy.nodes().length).toBe(1); expect(instance.cy.edges().length).toBe(0); expect(instance.cy.nodes().first().hasClass('seed')).toBe(true);
    instance.dispose();
  });
});

it('changes graph theme without replacing elements, selection, or camera', () => {
  const instance = createNetwork(undefined, vi.fn(), vi.fn());
  updateNetwork(instance.cy, parseGraph(fixture.graph), fixture.node_detail.gid);
  const node = instance.cy.nodes().first(); node.select();
  const darkColor = node.style('color');
  const position = { ...node.position() };
  instance.cy.zoom(1.7); instance.cy.pan({ x: 42, y: 61 });
  applyNetworkTheme(instance.cy, 'light');
  expect(node.style('color')).not.toBe(darkColor);
  expect(instance.cy.getElementById(node.id())[0]).toBe(node[0]);
  expect(node.selected()).toBe(true); expect(node.position()).toEqual(position);
  expect(instance.cy.zoom()).toBe(1.7); expect(instance.cy.pan()).toEqual({ x: 42, y: 61 });
  applyNetworkTheme(instance.cy, 'dark'); expect(node.style('color')).toBe(darkColor);
  instance.dispose();
});

it('highlights only the selected neighborhood without dropping isolates or directions', async () => {
  const {focusNetwork, labelNetwork, zoomNetwork, describeElement}=await import('./network');
  const instance=createNetwork(undefined,vi.fn(),vi.fn());
  const graph=parseGraph(fixture.graph);
  const isolated={...graph.nodes[0],id:'n:900000000000000003',gid:'900000000000000003'};
  updateNetwork(instance.cy,{...graph,nodes:[...graph.nodes,isolated]},null);
  const ids=instance.cy.elements().map(el=>el.id());
  focusNetwork(instance.cy,graph.nodes[0].id);
  expect(instance.cy.getElementById(isolated.id).hasClass('faded')).toBe(true);
  expect(instance.cy.edges().first().hasClass('focused')).toBe(true);
  expect(instance.cy.elements().map(el=>el.id())).toEqual(ids);
  expect(describeElement(instance.cy.edges().first())).toContain('900000000000000001 → 900000000000000002');
  labelNetwork(instance.cy,true); expect(instance.cy.$('node.all-labels').length).toBe(3);
  focusNetwork(instance.cy,null); expect(instance.cy.$('.faded').length).toBe(0);
  instance.cy.zoom(2); instance.cy.pan({x:20,y:30});
  const center={x:instance.cy.width()/2,y:instance.cy.height()/2};
  const before={x:(center.x-instance.cy.pan().x)/instance.cy.zoom(),y:(center.y-instance.cy.pan().y)/instance.cy.zoom()};
  zoomNetwork(instance.cy,1.25);
  expect((center.x-instance.cy.pan().x)/instance.cy.zoom()).toBeCloseTo(before.x);
  expect((center.y-instance.cy.pan().y)/instance.cy.zoom()).toBeCloseTo(before.y);
  zoomNetwork(instance.cy,100); expect(instance.cy.zoom()).toBe(4);
  zoomNetwork(instance.cy,.0001); expect(instance.cy.zoom()).toBe(.15);
  instance.dispose();
});

it('does not mark every cluster active when no gid is selected', () => {
  const instance=createNetwork(undefined,vi.fn(),vi.fn());
  const graph=parseGraph(fixture.graph);
  updateNetwork(instance.cy,{...graph,scope:{mode:'overview'},nodes:graph.nodes.map((n,i)=>({...n,id:`c:${i+1}`,kind:'cluster',gid:null,role:null})),edges:[]},null);
  expect(instance.cy.$('.active').length).toBe(0);
  instance.dispose();
});

import { describe, expect, it, vi } from 'vitest';
import fixture from '../../contracts/v1.example.json';
import { parseGraph } from './contract';
import { createNetwork, networkStyle, updateNetwork } from './network';

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

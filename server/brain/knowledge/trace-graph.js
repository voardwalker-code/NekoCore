// ============================================================
// REM System — Trace Graph Module
// Tracks memory access patterns and creates reasoning chains.
// ============================================================

const fs = require('fs');
const path = require('path');

class TraceGraph {
  constructor(options = {}) {
    this.memDir = options.memDir || path.join(__dirname, '../../../memories');
    this.traceDir = path.join(this.memDir, 'traces');
    
    // Ensure trace directory exists
    if (!fs.existsSync(this.traceDir)) {
      fs.mkdirSync(this.traceDir, { recursive: true });
    }
    
    this.activeTrace = null; // Current trace ID being built
  }

  /**
   * Create a new trace for a reasoning chain
   * user_prompt → mem_A → mem_B → mem_C
   */
  createTrace(triggerType = 'user_prompt', triggerId = null) {
    const traceId = `trace_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    this.activeTrace = {
      trace_id: traceId,
      created: new Date().toISOString(),
      trigger_type: triggerType,
      trigger_id: triggerId,
      chain: [
        {
          memory_id: triggerId,
          timestamp: new Date().toISOString(),
          step: 0,
          depth: 0
        }
      ]
    };
    
    console.log(`  ✓ Trace created: ${traceId}`);
    return traceId;
  }

  /**
   * Add a memory traversal to the current trace
   * Links memory_A → memory_B in the reasoning chain
   */
  addStep(fromMemId, toMemId, reason = 'semantic_similarity') {
    if (!this.activeTrace) {
      console.warn('  ⚠ No active trace');
      return null;
    }
    
    const step = this.activeTrace.chain.length;
    const depth = this.activeTrace.chain.length > 0 ? 
      this.activeTrace.chain[step - 1].depth + 1 : 0;
    
    this.activeTrace.chain.push({
      memory_id: toMemId,
      from_memory: fromMemId,
      reason,
      timestamp: new Date().toISOString(),
      step,
      depth
    });
    
    return {
      trace_id: this.activeTrace.trace_id,
      step,
      depth
    };
  }

  /**
   * Close and save the current trace
   */
  closeTrace() {
    if (!this.activeTrace) {
      console.warn('  ⚠ No active trace to close');
      return null;
    }
    
    const trace = this.activeTrace;
    const tracePath = path.join(this.traceDir, `${trace.trace_id}.json`);
    
    try {
      fs.writeFileSync(tracePath, JSON.stringify(trace, null, 2), 'utf8');
      console.log(`  ✓ Trace saved: ${trace.trace_id}`);
      
      this.activeTrace = null;
      return trace;
    } catch (err) {
      console.error('  ⚠ Trace save failed:', err.message);
      return null;
    }
  }

  /**
   * Get the current active trace
   */
  getActiveTrace() {
    return this.activeTrace;
  }

  /**
   * Retrieve a saved trace by ID
   */
  getTrace(traceId) {
    try {
      const tracePath = path.join(this.traceDir, `${traceId}.json`);
      
      if (!fs.existsSync(tracePath)) {
        console.warn(`  ⚠ Trace not found: ${traceId}`);
        return null;
      }
      
      return JSON.parse(fs.readFileSync(tracePath, 'utf8'));
    } catch (err) {
      console.error(`  ⚠ Trace retrieval failed for ${traceId}:`, err.message);
      return null;
    }
  }

  /**
   * Find traces that accessed a specific memory
   */
  findTracesAccessingMemory(memId, limit = 10) {
    try {
      const traces = [];
      const files = fs.readdirSync(this.traceDir)
        .filter(f => f.endsWith('.json'))
        .sort()
        .reverse()
        .slice(0, 100); // Check recent traces
      
      for (const file of files) {
        const trace = JSON.parse(fs.readFileSync(path.join(this.traceDir, file), 'utf8'));
        
        if (trace.chain.some(step => step.memory_id === memId)) {
          traces.push(trace);
          if (traces.length >= limit) break;
        }
      }
      
      return traces;
    } catch (err) {
      console.error('  ⚠ Trace search failed:', err.message);
      return [];
    }
  }

  /**
   * Find traces with a specific trigger type
   */
  findTracesByTrigger(triggerType, limit = 10) {
    try {
      const traces = [];
      const files = fs.readdirSync(this.traceDir)
        .filter(f => f.endsWith('.json'))
        .sort()
        .reverse()
        .slice(0, 100);
      
      for (const file of files) {
        const trace = JSON.parse(fs.readFileSync(path.join(this.traceDir, file), 'utf8'));
        
        if (trace.trigger_type === triggerType) {
          traces.push(trace);
          if (traces.length >= limit) break;
        }
      }
      
      return traces;
    } catch (err) {
      console.error('  ⚠ Trigger search failed:', err.message);
      return [];
    }
  }

  /**
   * Build a graph of memory-to-memory connections from traces
   * Shows which memories are accessed together
   */
  buildConnectionGraph(maxMemories = 50) {
    try {
      const connections = {}; // mem_A -> [{ to: mem_B, count: 3, reasons: [...] }]
      const files = fs.readdirSync(this.traceDir)
        .filter(f => f.endsWith('.json'));
      
      // Analyze all traces
      for (const file of files) {
        const trace = JSON.parse(fs.readFileSync(path.join(this.traceDir, file), 'utf8'));
        
        // Process chain steps
        for (let i = 0; i < trace.chain.length - 1; i++) {
          const fromMem = trace.chain[i].memory_id;
          const toMem = trace.chain[i + 1].memory_id;
          const reason = trace.chain[i + 1].reason || 'unknown';
          
          if (!connections[fromMem]) {
            connections[fromMem] = [];
          }
          
          const existing = connections[fromMem].find(c => c.to === toMem);
          if (existing) {
            existing.count++;
            if (!existing.reasons.includes(reason)) {
              existing.reasons.push(reason);
            }
          } else {
            connections[fromMem].push({
              to: toMem,
              count: 1,
              reasons: [reason]
            });
          }
        }
      }
      
      return connections;
    } catch (err) {
      console.error('  ⚠ Graph building failed:', err.message);
      return {};
    }
  }

  /**
   * Get recommendations for related memories
   * Based on access pattern graph
   */
  getRelatedMemories(memId, limit = 5) {
    try {
      const graph = this.buildConnectionGraph();
      
      // Get memories accessed after this one
      const outgoing = (graph[memId] || [])
        .sort((a, b) => b.count - a.count)
        .slice(0, limit)
        .map(conn => ({
          memory_id: conn.to,
          strength: conn.count,
          reasons: conn.reasons
        }));
      
      // Get memories that access this one
      const incoming = [];
      for (const [source, targets] of Object.entries(graph)) {
        const match = targets.find(t => t.to === memId);
        if (match) {
          incoming.push({
            memory_id: source,
            strength: match.count,
            reasons: match.reasons
          });
        }
      }
      
      return {
        outgoing: outgoing,
        incoming: incoming.sort((a, b) => b.strength - a.strength).slice(0, limit)
      };
    } catch (err) {
      console.error('  ⚠ Recommendation failed:', err.message);
      return { outgoing: [], incoming: [] };
    }
  }

  /**
   * Analyze trace depth distribution
   * Returns average chain length, max depth, etc.
   */
  analyzeTraces() {
    try {
      const files = fs.readdirSync(this.traceDir)
        .filter(f => f.endsWith('.json'));
      
      if (files.length === 0) {
        return { total_traces: 0 };
      }
      
      let totalLength = 0;
      let maxDepth = 0;
      let triggerDistribution = {};
      
      for (const file of files) {
        const trace = JSON.parse(fs.readFileSync(path.join(this.traceDir, file), 'utf8'));
        
        totalLength += trace.chain.length;
        const traceMaxDepth = Math.max(...trace.chain.map(s => s.depth), 0);
        maxDepth = Math.max(maxDepth, traceMaxDepth);
        
        const trigger = trace.trigger_type;
        triggerDistribution[trigger] = (triggerDistribution[trigger] || 0) + 1;
      }
      
      return {
        total_traces: files.length,
        avg_chain_length: totalLength / files.length,
        max_depth: maxDepth,
        trigger_distribution: triggerDistribution
      };
    } catch (err) {
      console.error('  ⚠ Trace analysis failed:', err.message);
      return {};
    }
  }

  /**
   * Export traces as a graph visualization format (for debugging)
   */
  exportGraphviz() {
    try {
      const graph = this.buildConnectionGraph();
      let gv = 'digraph MemoryGraph {\n';
      gv += '  rankdir=LR;\n';
      gv += '  node [shape=box];\n\n';
      
      for (const [from, targets] of Object.entries(graph)) {
        for (const target of targets.sort((a, b) => b.count - a.count).slice(0, 3)) {
          const weight = Math.min(target.count, 5);
          gv += `  "${from}" -> "${target.to}" [label="${target.count}", penwidth=${weight}];\n`;
        }
      }
      
      gv += '}\n';
      return gv;
    } catch (err) {
      console.error('  ⚠ Graphviz export failed:', err.message);
      return '';
    }
  }
}

module.exports = TraceGraph;

/**
 * Task DAG Scheduler (Dependency Resolution & File Ownership Core)
 * Models tasks as a Directed Acyclic Graph (DAG) with topological sorting,
 * cycle detection, file ownership locks (preventing race conditions on shared files),
 * and parallel execution batch generation.
 */

class TaskDagScheduler {
  constructor() {
    this.tasks = new Map();
  }

  /**
   * Registers a task in the DAG
   */
  addTask(task) {
    if (!task.id) throw new Error('Task must have a unique id');

    this.tasks.set(task.id, {
      id: task.id,
      name: task.name || task.id,
      stageIndex: task.stageIndex !== undefined ? task.stageIndex : 4,
      agent: task.agent || 'Senior Builder',
      skills: Array.isArray(task.skills) ? task.skills : [],
      dependsOn: Array.isArray(task.dependsOn) ? task.dependsOn : [],
      targetFiles: Array.isArray(task.targetFiles) ? task.targetFiles : [],
      status: task.status || 'PENDING',
      evidenceId: null,
      error: null
    });
  }

  /**
   * Validates that all dependencies exist and that there are no circular dependencies
   */
  validateDag() {
    // 1. Verify all dependencies exist
    for (const [id, task] of this.tasks.entries()) {
      for (const depId of task.dependsOn) {
        if (!this.tasks.has(depId)) {
          throw new Error(`DAG Dependency Error: Task "${id}" depends on unknown task "${depId}"`);
        }
      }
    }

    // 2. Cycle Detection using DFS graph coloring (0: unvisited, 1: visiting, 2: visited)
    const visited = new Map();
    const self = this;

    function hasCycle(nodeId) {
      visited.set(nodeId, 1); // visiting
      const task = self.tasks.get(nodeId);

      for (const depId of task.dependsOn) {
        const state = visited.get(depId) || 0;
        if (state === 1) {
          throw new Error(`Circular Dependency Detected in Task DAG: "${nodeId}" <--> "${depId}"`);
        }
        if (state === 0 && hasCycle(depId)) {
          return true;
        }
      }

      visited.set(nodeId, 2); // visited
      return false;
    }

    for (const id of this.tasks.keys()) {
      if ((visited.get(id) || 0) === 0) {
        hasCycle(id);
      }
    }

    return true;
  }

  /**
   * Partitions the DAG into sequential batches of parallelizable tasks (Kahn's Algorithm)
   * Also enforces file ownership so no two concurrent tasks write to the same file.
   */
  getExecutionBatches() {
    this.validateDag();

    const inDegree = new Map();
    const dependents = new Map();

    for (const id of this.tasks.keys()) {
      inDegree.set(id, 0);
      dependents.set(id, []);
    }

    for (const [id, task] of this.tasks.entries()) {
      for (const depId of task.dependsOn) {
        inDegree.set(id, inDegree.get(id) + 1);
        dependents.get(depId).push(id);
      }
    }

    const batches = [];
    let readyQueue = [];

    for (const [id, deg] of inDegree.entries()) {
      if (deg === 0) readyQueue.push(this.tasks.get(id));
    }

    while (readyQueue.length > 0) {
      // In current batch, filter out file ownership collisions to ensure safety
      const currentBatch = [];
      const claimedFiles = new Set();
      const deferredQueue = [];

      for (const task of readyQueue) {
        let hasCollision = false;
        for (const file of task.targetFiles) {
          if (claimedFiles.has(file)) {
            hasCollision = true;
            break;
          }
        }

        if (!hasCollision) {
          currentBatch.push(task);
          task.targetFiles.forEach(f => claimedFiles.add(f));
        } else {
          deferredQueue.push(task);
        }
      }

      batches.push(currentBatch);

      // Decrement in-degree for dependents of executed batch
      const nextReady = [...deferredQueue];
      for (const task of currentBatch) {
        for (const depId of dependents.get(task.id)) {
          inDegree.set(depId, inDegree.get(depId) - 1);
          if (inDegree.get(depId) === 0) {
            nextReady.push(this.tasks.get(depId));
          }
        }
      }

      readyQueue = nextReady;
    }

    return batches;
  }

  /**
   * Renders the Task DAG as a Mermaid flowchart diagram
   */
  renderMermaidDag() {
    let md = '```mermaid\nflowchart TD\n';
    for (const [id, task] of this.tasks.entries()) {
      const label = `${id}: ${task.name.replace(/"/g, "'")}`;
      md += `    ${id}["${label}"]\n`;
    }

    for (const [id, task] of this.tasks.entries()) {
      for (const depId of task.dependsOn) {
        md += `    ${depId} --> ${id}\n`;
      }
    }
    md += '```\n';
    return md;
  }
}

module.exports = {
  TaskDagScheduler
};

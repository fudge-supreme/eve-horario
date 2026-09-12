import { createRepo } from './baseRepo.js';

const base = createRepo('subtasks');

export const subtaskRepo = {
  ...base,
  async listByTask(taskId) {
    const all = await base.list();
    return all
      .filter((s) => s.task_id === taskId)
      .sort((a, b) => a.position - b.position);
  },
};

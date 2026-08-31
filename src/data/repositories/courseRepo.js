import { createRepo } from './baseRepo.js';

const base = createRepo('courses');

export const courseRepo = {
  ...base,
  async listBySchedule(scheduleId) {
    const all = await base.list();
    return all.filter((c) => c.schedule_id === scheduleId);
  },
};

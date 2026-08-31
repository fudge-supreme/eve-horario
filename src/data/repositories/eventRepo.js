import { createRepo } from './baseRepo.js';

const base = createRepo('events');

export const eventRepo = {
  ...base,
  async listBySchedule(scheduleId) {
    const all = await base.list();
    return all.filter((e) => e.schedule_id === scheduleId);
  },
};

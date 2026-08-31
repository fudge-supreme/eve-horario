import { createRepo } from './baseRepo.js';

const base = createRepo('notes');

export const noteRepo = {
  ...base,
  async listByCourse(courseId) {
    const all = await base.list();
    return all.filter((n) => n.course_id === courseId);
  },
};

import { createRepo } from './baseRepo.js';

const base = createRepo('class_sessions');

export const classSessionRepo = {
  ...base,
  async listByCourse(courseId) {
    const all = await base.list();
    return all.filter((s) => s.course_id === courseId);
  },
  async listByCourses(courseIds) {
    const set = new Set(courseIds);
    const all = await base.list();
    return all.filter((s) => set.has(s.course_id));
  },
};

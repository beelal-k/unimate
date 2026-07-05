export interface UmtCourse {
  code: string;
  title: string;
  creditHours: string | null;
  type: string | null;
  faculty: string | null;
  email: string | null;
  mode: string | null;
  section: string | null;
  semester: string | null;
}

export interface UmtTimetableRow {
  day: string;
  code: string;
  name: string;
  faculty: string | null;
  type: string | null;
  mode: string | null;
  startTime: string;
  endTime: string;
  room: string | null;
}

/** A single time-slot for a course, ready to become a `classes` row. */
export interface ImportedClass {
  name: string;
  code: string | null;
  section: string | null;
  instructor: string | null;
  room: string | null;
  daysOfWeek: number[];
  startTime: string; // 'HH:MM' 24h
  endTime: string; // 'HH:MM' 24h
}

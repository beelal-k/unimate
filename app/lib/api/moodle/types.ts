export interface MoodleCredentials {
  siteUrl: string;
  token: string;
}

export interface MoodleSiteInfo {
  userid: number;
  fullname: string;
  username: string;
  sitename: string;
}

export interface MoodleCourse {
  id: number;
  shortname: string;
  fullname: string;
  enrolledusercount?: number;
  summary?: string;
  startdate?: number;
}

export interface MoodleAttachment {
  filename: string;
  fileurl: string;
  filesize: number;
  mimetype: string;
}

export interface MoodleAssignmentConfig {
  plugin: string;
  subtype: string;
  name: string;
  value: string;
}

export interface MoodleAssignment {
  id: number;
  cmid: number;
  course: number;
  name: string;
  duedate: number;
  allowsubmissionsfromdate: number;
  grade: number;
  intro: string;
  nosubmissions: number;
  introattachments?: MoodleAttachment[];
  configs?: MoodleAssignmentConfig[];
}

export interface MoodleSubmissionStatus {
  lastattempt?: {
    submission?: {
      status: 'new' | 'draft' | 'submitted' | 'reopened' | string;
    };
    submissionsenabled?: boolean;
  };
}

export interface MoodleGrade {
  courseid: number;
  itemname: string;
  graderaw: number | null;
  grademax: number;
  feedback: string;
}

export interface MoodleQuiz {
  id: number;
  course: number;
  coursemodule: number;
  name: string;
  intro: string;
  timeopen: number;    // unix; 0 = always open
  timeclose: number;   // unix; 0 = no deadline
  timelimit: number;   // seconds; 0 = no limit
  attempts: number;    // max attempts; 0 = unlimited
  grademethod: number; // 1=highest 2=avg 3=first 4=last
  sumgrades: number;   // total raw marks
  grade: number;       // normalised grade scale
}

export type AttemptState = 'inprogress' | 'finished' | 'abandoned' | 'overdue';

export interface MoodleAttempt {
  id: number;
  quiz: number;
  userid: number;
  attempt: number;   // attempt number (1-based)
  uniqueid: number;  // question usage id, needed to build field names
  layout: string;    // "slot,0,slot,0,..." page separator format
  currentpage: number;
  state: AttemptState;
  timestart: number;
  timefinish: number;
  timemodified: number;
  sumgrades: number | null;
}

export interface ParsedOption {
  value: string;
  label: string;
}

export interface ParsedQuestion {
  slot: number;
  page: number;
  number: number;
  type: string;
  text: string;
  options: ParsedOption[];
  inputName: string;         // e.g. "q221245:9_answer"
  seqName: string;           // e.g. "q221245:9_:sequencecheck"
  seqValue: string;          // current sequencecheck value (increments per save)
  selectedValue: string | null;
  state: string;             // stateclass: 'notyetanswered' | 'answersaved' | 'complete'
  maxMark: number;
}

export interface QuizBestGrade {
  hasgrade: boolean;
  grade?: number;
}

export type Task = {
  id: string;
  text: string;
  done: boolean;
  cycleId: string | null;
  phaseId: string | null;
  sectionId: string | null;
  recurrenceId: string | null;
  deadline: string | null;
  habitCue: string | null;
  tinyStart: string | null;
  identity: string | null;
  leetcodeProblemId: string | null;
  streak: number;
  recoveryDue: boolean;
};

export type TaskDraft = Pick<Task, 'id' | 'text' | 'cycleId' | 'phaseId' | 'sectionId' | 'recurrenceId' | 'deadline' | 'habitCue' | 'tinyStart' | 'identity' | 'leetcodeProblemId'>;

export type DayEntry = {
  tasks: Task[];
  activity: string;
  reflection: string;
  revision: string | null;
};

export type DaySection = {
  id: string;
  title: string;
};

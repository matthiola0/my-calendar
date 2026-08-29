export type PlannerChatMessage = {
  role: 'user' | 'assistant';
  content: string;
};

export type ProposedPhase = {
  title: string;
  description: string;
  startDate: string;
  endDate: string;
};

export type ProposedCycle = {
  title: string;
  goal: string;
  reward: string;
  startDate: string;
  endDate: string;
  phases: ProposedPhase[];
};

export type ProposedTaskLink =
  | null
  | {
    source: 'existing';
    cycleId: string;
    phaseId: string | null;
  }
  | {
    source: 'proposed';
    phaseIndex: number | null;
  };

export type ProposedTask = {
  date: string;
  text: string;
  sectionId: string | null;
  cycleLink: ProposedTaskLink;
  habitCue: string | null;
  tinyStart: string | null;
  identity: string | null;
};

export type PlannerProposal = {
  summary: string;
  cycle: ProposedCycle | null;
  tasks: ProposedTask[];
};

export type PlannerReply = {
  message: string;
  questions: string[];
  proposal: PlannerProposal | null;
};


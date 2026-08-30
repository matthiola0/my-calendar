'use client';

import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useSyncExternalStore } from 'react';

export type Language = 'en' | 'zh' | 'ja';

const en = {
  languageLabel: 'Language',
  brandName: 'Daybook',
  brandMark: 'D',
  brandHome: 'Back to Daybook',
  navLabel: 'Calendar views',
  navDaily: 'Daily',
  navCycles: 'Macro cycles',
  navPlanner: 'AI planner',
  signOut: 'Sign out',
  authEyebrow: 'BREAK GOALS DOWN · BUILD HABITS UP',
  authHeadline1: 'Turn what you want to achieve',
  authHeadline2: 'into one small step for today.',
  authDescription: 'Plan, review, and adjust with AI. Build lasting change through tasks small enough to do today.',
  authFootnote: 'SMALL STEPS · AI GUIDED · LASTING CHANGE',
  authTabsLabel: 'Sign in or create an account',
  authLogin: 'Sign in',
  authRegister: 'Create account',
  authWelcome: 'Welcome back',
  authCreateTitle: 'Create your Daybook',
  authLoginDescription: 'Choose a sign-in method and continue today’s page.',
  authRegisterDescription: 'Create an account to keep your calendar in sync across devices.',
  authGoogle: 'Continue with Google',
  authDivider: 'or use a username and password',
  authUsername: 'Username',
  authUsernamePlaceholder: '3–30 letters, numbers, _ or -',
  authPassword: 'Password',
  authPasswordPlaceholder: 'At least 10 characters',
  authConfirmPassword: 'Confirm password',
  authConfirmPlaceholder: 'Enter your password again',
  authPasswordMismatch: 'The passwords do not match.',
  authTaken: 'That username is already in use.',
  authCredentials: 'The username or password is incorrect.',
  authInvalidFormat: 'Use a 3–30 character username and a password of at least 10 characters.',
  authUnavailable: 'Sign-in is temporarily unavailable. Please try again.',
  authNetworkError: 'Could not connect. Check your network and try again.',
  authPleaseWait: 'Please wait…',
  authLoginButton: 'Open my calendar',
  authRegisterButton: 'Create account and start',
  authPrivacy1: 'Your tasks, notes, and reflections are private to your account.',
  authPrivacyLink: 'Read the privacy policy',
  noCycle: 'No macro cycle',
  wholeCycle: '{title} (whole cycle)',
  noSection: 'Not scheduled',
  syncLoading: 'Loading cloud data…',
  syncSaving: 'Syncing…',
  syncSaved: 'Synced to the cloud',
  syncConflict: 'Updated on another device. Please refresh.',
  syncError: 'Sync failed. Check your connection.',
  createdRecurring: 'Created {count} recurring tasks.',
  createdShortCycle: 'Created {count} daily tasks through {date}.',
  shortCycleDeadlineError: 'Choose a deadline 1 to 364 days after the start date.',
  addedToday: 'Added to today.',
  taskCreateError: 'Could not create the task.',
  seriesUpdated: 'Updated {count} tasks in this series.',
  seriesUpdateError: 'Could not update the recurring series.',
  seriesDeleteConfirm: 'Delete this entire recurring series? Every occurrence will be removed.',
  seriesDeleted: 'Deleted {count} tasks from this series.',
  seriesDeleteError: 'Could not delete the recurring series.',
  unnamedSection: 'Untitled section',
  customDeleteConfirm: 'Delete “{title}” and its content on every date?',
  taskUndo: 'Mark incomplete: {task}',
  taskDone: 'Mark complete: {task}',
  taskEdit: 'Edit task: {task}',
  taskDelete: 'Delete: {task}',
  bindCycle: 'Link to a macro cycle',
  scheduleSection: 'Schedule in a day section',
  taskCuePlaceholder: 'Cue: what happens right before you start?',
  taskTinyPlaceholder: 'Two-minute start: what is the smallest first action?',
  taskIdentityPlaceholder: 'Identity: who are you becoming?',
  saveThisOccurrence: 'Save this occurrence',
  applySeries: 'Apply to entire series',
  deleteSeries: 'Delete entire series',
  cancel: 'Cancel',
  edit: 'Edit',
  recurring: 'Recurring',
  deadlineBadge: 'Due {date}',
  streak: '{count}-task streak',
  identity: 'Identity: {value}',
  cue: 'Cue: after “{value}”',
  tinyStart: 'Two-minute start: {value}',
  recovery: 'The previous occurrence is still open. Do the two-minute version now and avoid missing twice.',
  brandTop: 'Back to the top of today’s page',
  dailyEyebrow: '{year} · ONE DAY AT A TIME',
  dateNav: 'Change date',
  previousDay: 'Previous day',
  chooseDate: 'Choose date',
  nextDay: 'Next day',
  backToday: 'Back to today',
  nearbyDates: 'Nearby dates',
  completedOnDate: 'This date has completed tasks',
  todayTasks: 'Today’s small steps',
  progressLabel: '{progress}% complete',
  progressCount: '{completed} / {total} complete',
  startSlowly: 'Start small',
  splitDay: 'Split each day into',
  noSplit: 'No sections',
  splitCount: '{count} sections',
  sectionName: 'Section name',
  sectionHelpActive: 'Drag tasks into a section below. On mobile, tap a task to choose its section.',
  sectionHelpEmpty: 'Create sections to divide your day into focused blocks.',
  newTask: 'Add a task',
  newTaskPlaceholder: 'What is the next small step?',
  repeatHabit: 'Recurrence and habit design',
  repeatCycle: 'Repeat',
  noRepeat: 'Does not repeat',
  shortCycle: 'Short cycle · daily until deadline',
  repeatDaily: 'Daily',
  repeatWeekly: 'Weekly',
  repeatMonthly: 'Monthly',
  every: 'Every',
  repeatEnds: 'Ends',
  repeatCountMode: 'After a number of occurrences',
  repeatDateMode: 'On a date',
  totalOccurrences: 'Total occurrences (including this one)',
  repeatUntil: 'Repeat until',
  deadline: 'Deadline',
  identityHabit: 'Identity-based habit (optional)',
  identityExample: 'Example: become an engineer who keeps learning',
  habitCue: 'Habit cue (optional)',
  cueExample: 'Example: after making my first coffee',
  twoMinute: 'Two-minute version (optional)',
  twoMinuteExample: 'Example: open the problem and write the inputs',
  addTaskLabel: 'Add task',
  blankDay: 'Today is still a blank page',
  loadingDay: 'Opening today’s page',
  blankDayHint: 'One small thing is enough to begin.',
  waitMoment: 'Please wait a moment.',
  itemCount: '{count} tasks',
  dropHere: 'Drop here',
  unassigned: 'Not scheduled',
  activityTitle: 'What I did today',
  activityPlaceholder: 'Capture what happened today…\n\nWhat did you finish, where did you go, or who did you meet?',
  reflectionTitle: 'Daily reflection',
  reflectionPlaceholder: 'How did today feel?\nLeave one useful thought for tomorrow.',
  customRecords: 'Custom records',
  customRecordsHint: 'Create a field once and use it on every date.',
  customFieldExample: 'Example: LeetCode notes',
  addField: 'Add field',
  deleteField: 'Delete field: {title}',
  delete: 'Delete',
  customFieldPlaceholder: 'Write today’s {title}…',
  noCustomFields: 'No custom fields yet. Add “LeetCode notes” or anything you want to track each day.',
  dailyFooter: 'One page a day, one small step at a time.',
  cycleSaved: 'Macro cycle synced to the cloud.',
  saveFailed: 'Could not save.',
  aiPromptCopied: 'AI breakdown prompt copied. Paste it into any AI conversation.',
  cyclesEyebrow: 'MACRO CYCLE · SET THE DIRECTION',
  cyclesHeadline: 'Turn the distant goal into today’s next step.',
  cyclesDescription: 'Define a goal and its phases, then let AI turn them into realistic daily actions.',
  addCycle: 'Add macro cycle',
  editCycle: 'Edit macro cycle',
  newCycle: 'Create a macro cycle',
  cycleName: 'Name',
  cycleNameExample: 'Example: Launch my portfolio by October',
  start: 'Start',
  end: 'End',
  cycleGoal: 'Who or where do I want to be when this cycle ends?',
  cycleGoalPlaceholder: 'Describe the outcome, not just the activity.',
  cycleReward: 'How will I reward myself?',
  cycleRewardPlaceholder: 'Example: take a day trip or buy a book I have wanted.',
  status: 'Status',
  active: 'Active',
  completed: 'Completed',
  phases: 'Phases',
  phasesHint: 'Give each phase one clear focus.',
  addPhase: 'Add phase',
  phaseName: 'Phase name',
  phaseOutcome: 'What should be true at the end of this phase?',
  remove: 'Remove',
  cycleDataNote: 'This stays in your calendar. You choose when to share a prompt with an AI.',
  saving: 'Saving…',
  saveCycle: 'Save macro cycle',
  loadingCycles: 'Opening your macro cycles…',
  emptyCyclesTitle: 'Choose a direction first',
  emptyCyclesText: 'Create your first macro cycle, then divide it into phases with clear outcomes.',
  cycleProgress: 'Macro cycle progress: {progress}%',
  cycleTasksDone: '{completed} / {total} daily tasks complete',
  noLinkedTasks: 'No daily tasks linked yet',
  reward: 'REWARD',
  noReward: 'Not set yet. Give your future self something to look forward to.',
  noPhases: 'No phases yet. Ask AI to help break this cycle down.',
  copyAiPrompt: 'Copy AI breakdown prompt',
  cyclesFooter: 'Macro cycles set the direction. Daily cycles create momentum.',
  cycleAiPrompt: 'Read the existing calendar dates in this macro cycle, preserve current items, and break every phase into realistic daily tasks. Link each new task to the right macro cycle and phase, keep each day achievable, and read the dates again after writing.\n\nMacro cycle: {title}\nDates: {startDate}–{endDate}\nGoal: {goal}\nReward: {reward}\nPhases:\n{phases}',
  notSet: 'Not set',
  phasesNotSet: '- Not set. Help me define the phases first.',
  plannerWelcome: 'Tell me what you want to finish, your deadline, and how much time you can invest. I will read only the relevant dates and return a plan you can preview.',
  plannerTemporaryError: 'The AI planner is temporarily unavailable.',
  plannerApplyError: 'Could not apply this proposal.',
  plannerAppliedCycle: 'Created a macro cycle',
  plannerAppliedTasks: 'added {count} tasks',
  plannerSkippedTasks: 'skipped {count} duplicates',
  plannerApplied: 'Proposal applied. Return to Daily or Macro cycles to review it.',
  plannerEyebrow: 'AI PLANNER · PREVIEW BEFORE APPLYING',
  plannerHeadline: 'Turn an idea into days you can actually do.',
  plannerDescription: 'AI reads only the dates needed for planning. Nothing changes until you approve the proposal.',
  plannerNoSave: 'Conversation not saved',
  plannerNoSaveHint: 'Cleared when you leave or refresh',
  plannerSuggestionsTitle: 'Not sure where to begin?',
  plannerFillPrompt: 'Use this prompt',
  plannerCurrentDate: 'Relative dates use {date} as “today”.',
  plannerThinking: 'AI is planning',
  plannerPlaceholder: 'Example: I want to launch my portfolio by the end of October and can spend eight hours a week…',
  plannerAria: 'Plan my calendar with AI',
  send: 'Send',
  pleaseWait: 'Please wait',
  plannerComposerHint: 'Enter to send · Shift + Enter for a new line. Avoid unnecessary sensitive information.',
  proposalLabel: 'AI calendar proposal',
  proposalPreview: 'PROPOSAL PREVIEW',
  proposalTaskCount: '{count} new tasks',
  proposalNewCycle: 'NEW MACRO CYCLE',
  proposalSafety: 'Applying only adds content. Existing items are never deleted or overwritten.',
  proposalApplied: 'Applied',
  proposalApplying: 'Applying…',
  proposalApply: 'Apply to calendar',
  suggestionCycleLabel: 'Plan a macro cycle',
  suggestionCyclePrompt: 'I want to create a new macro cycle. Ask no more than three essential questions, then propose phases, buffer time, and a completion reward.',
  suggestionDailyLabel: 'Break it into daily tasks',
  suggestionDailyPrompt: 'Read my active macro cycles and the next two weeks of existing calendar items. Preserve them and break the current phase into realistic daily tasks.',
  suggestionLoadLabel: 'Check for overload',
  suggestionLoadPrompt: 'Review next week’s tasks and macro cycles. Identify overloaded days or date conflicts, then suggest adjustments before making changes.',
  suggestionTodayLabel: 'Plan only today',
  suggestionTodayPrompt: 'I have 90 minutes today. Read today’s calendar, choose the two highest-value small tasks to add, and preserve buffer time.',
  suggestionHabitLabel: 'Build a habit',
  suggestionHabitPrompt: 'Help me design a new habit with an identity, cue, two-minute start, and a realistic two-week schedule.',
  suggestionAdjustLabel: 'Adjust to my progress',
  suggestionAdjustPrompt: 'Use my current macro-cycle progress and the next two weeks of calendar items to propose a more realistic daily plan.',
  privacyEyebrow: 'PRIVACY POLICY',
  privacyTitle: 'Privacy policy',
  privacyUpdated: 'Last updated: August 29, 2026',
  privacyCollectedTitle: 'Information we collect',
  privacyCollectedText: 'To provide sign-in and cross-device sync, Daybook processes account identifiers such as a Google user ID, email address, and display name, or a registered username and hashed password. We also store the tasks, activity notes, reflections, and planning data you choose to enter.',
  privacyUseTitle: 'How we use information',
  privacyUseText: 'We use this information only to authenticate you, display your personal calendar, sync content across devices, and protect the service. Every account is isolated from other users.',
  privacyCookiesTitle: 'Sign-in and cookies',
  privacyCookiesText: 'After sign-in, a secure HttpOnly session cookie keeps you signed in. Google sign-in provides only the basic profile data needed for authentication. Daybook does not store a Google access token or access Google Calendar, Drive, or other Google content.',
  privacyStorageTitle: 'Storage and sharing',
  privacyStorageText: 'Data is stored in the managed database used by this site and processed by infrastructure providers required to run the service. We do not sell personal information or use calendar content for advertising.',
  privacyAiTitle: 'AI planning',
  privacyAiText: 'When you choose AI planning, the conversation and the minimum tasks, macro cycles, phases, and day sections needed for that plan are sent to Groq for processing. Daybook does not permanently save the conversation, and no proposal changes the calendar until you approve it. Avoid unrelated sensitive information and review Groq’s current data policy.',
  privacyChoicesTitle: 'Your choices',
  privacyChoicesText: 'You may stop using the service or request access to or deletion of your account and content through the support contact shown in the Google OAuth consent screen.',
  privacyBack: 'Back to Daybook',
} as const;

type MessageKey = keyof typeof en;

const zh: Record<MessageKey, string> = {
  ...en,
  languageLabel: '語言', brandName: '日常', brandMark: '日', brandHome: '返回日常首頁', navLabel: '行事曆檢視', navDaily: '小週期 · 每日', navCycles: '大週期', navPlanner: 'AI 規劃', signOut: '登出',
  authEyebrow: '大目標拆小 · 小行動成習慣', authHeadline1: '把想做到的事，', authHeadline2: '拆成今天能開始的一小步。', authDescription: '讓 AI 協助規劃、回顧與調整，用每天做得到的小任務，慢慢累積真正的改變。', authTabsLabel: '登入或註冊', authLogin: '登入', authRegister: '註冊', authWelcome: '歡迎回來', authCreateTitle: '建立你的日常', authLoginDescription: '選擇一種方式，繼續寫今天這一頁。', authRegisterDescription: '註冊後即可在不同裝置同步你的內容。', authGoogle: '使用 Google 帳號登入', authDivider: '或使用帳號密碼', authUsername: '帳號', authUsernamePlaceholder: '3–30 個英數字、_ 或 -', authPassword: '密碼', authPasswordPlaceholder: '至少 10 個字元', authConfirmPassword: '確認密碼', authConfirmPlaceholder: '再輸入一次密碼', authPasswordMismatch: '兩次輸入的密碼不一致。', authTaken: '這個帳號已被使用。', authCredentials: '帳號或密碼不正確。', authInvalidFormat: '帳號需為 3–30 個字元，密碼至少 10 個字元。', authUnavailable: '暫時無法登入，請稍後再試。', authNetworkError: '連線失敗，請檢查網路後再試。', authPleaseWait: '請稍候…', authLoginButton: '登入我的行事曆', authRegisterButton: '註冊並開始使用', authPrivacy1: '你的待辦、紀錄與心得不會與其他使用者共用。', authPrivacyLink: '查看隱私權政策',
  noCycle: '不綁定大週期', wholeCycle: '{title}（整體）', noSection: '尚未安排時段', syncLoading: '正在讀取雲端資料…', syncSaving: '正在同步…', syncSaved: '已同步至雲端', syncConflict: '其他裝置已更新，請重新整理', syncError: '同步失敗，請檢查網路', createdRecurring: '已建立 {count} 個重複任務。', addedToday: '已加入今天。', taskCreateError: '無法建立任務。', seriesUpdated: '已更新全系列 {count} 個任務。', seriesUpdateError: '無法更新重複任務。', seriesDeleteConfirm: '刪除這一整組重複任務？所有日期的這組任務都會被刪除。', seriesDeleted: '已刪除全系列 {count} 個任務。', seriesDeleteError: '無法刪除重複任務。', unnamedSection: '未命名時段', customDeleteConfirm: '刪除「{title}」會一併刪除所有日期的內容，確定嗎？',
  taskUndo: '取消完成：{task}', taskDone: '標示完成：{task}', taskEdit: '編輯待辦：{task}', taskDelete: '刪除：{task}', bindCycle: '綁定大週期', scheduleSection: '安排時段', taskCuePlaceholder: '提示：在什麼行為之後開始？', taskTinyPlaceholder: '兩分鐘版本：先做哪個最小動作？', taskIdentityPlaceholder: '身份：我想成為怎樣的人？', saveThisOccurrence: '只儲存這次', applySeries: '套用全系列', deleteSeries: '刪除全系列', cancel: '取消', edit: '編輯', recurring: '重複', streak: '連續完成 {count} 次', identity: '身份：{value}', cue: '提示：在「{value}」之後', tinyStart: '兩分鐘開始：{value}', recovery: '上一回尚未完成；這次先做兩分鐘版本，避免連續錯過兩次。',
  brandTop: '回到今日手帳頂端', dailyEyebrow: '{year} 年 · 我的每一天', dateNav: '日期切換', previousDay: '前一天', chooseDate: '選擇日期', nextDay: '後一天', backToday: '回到今天', nearbyDates: '鄰近日期', completedOnDate: '這天已有完成事項', todayTasks: '今天要完成', progressLabel: '已完成 {progress}%', progressCount: '{completed} / {total} 完成', startSlowly: '慢慢開始', splitDay: '把每天切成', noSplit: '不切分', splitCount: '{count} 等分', sectionName: '分段名稱', sectionHelpActive: '拖曳待辦到下方分段；手機可點文字後選擇時段。', sectionHelpEmpty: '設定後可把任務拖曳到一天的不同部分。', newTask: '新增待辦事項', newTaskPlaceholder: '寫下接下來要做的事…', repeatHabit: '重複與習慣設計', repeatCycle: '重複週期', noRepeat: '不重複', repeatDaily: '按天', repeatWeekly: '按週', repeatMonthly: '按月', every: '每隔', repeatEnds: '結束方式', repeatCountMode: '出現次數', repeatDateMode: '結束日期', totalOccurrences: '總次數（含本次）', repeatUntil: '重複到', identityHabit: '身份型習慣（選填）', identityExample: '例如：成為持續精進的工程師', habitCue: '習慣提示（選填）', cueExample: '例如：泡好早上第一杯咖啡', twoMinute: '兩分鐘版本（選填）', twoMinuteExample: '例如：只打開題目並寫下輸入輸出', addTaskLabel: '加入待辦', blankDay: '今天還是一張白紙', loadingDay: '正在打開今天這一頁', blankDayHint: '從一件小事開始，就很好。', waitMoment: '請稍候片刻。', itemCount: '{count} 件', dropHere: '拖到這裡', unassigned: '尚未安排', activityTitle: '今天做了什麼', activityPlaceholder: '把今天發生的事記下來…\n\n完成了什麼、去了哪裡，或是遇見了誰？', reflectionTitle: '今日心得', reflectionPlaceholder: '今天有什麼感受？\n留一句話，給明天的自己。', customRecords: '自訂紀錄', customRecordsHint: '新增一次後，每一天都會有同一個欄位。', customFieldExample: '例如：LeetCode 筆記', addField: '新增欄位', deleteField: '刪除欄位：{title}', delete: '刪除', customFieldPlaceholder: '寫下今天的{title}…', noCustomFields: '還沒有自訂欄位。可以先新增「LeetCode 筆記」或任何你想每天追蹤的內容。', dailyFooter: '一天一頁，把日子好好收進來。',
  cycleSaved: '大週期已同步至雲端。', saveFailed: '儲存失敗。', aiPromptCopied: 'AI 拆解指令已複製；貼到你的 AI 對話即可。', cyclesEyebrow: 'MACRO CYCLE · 先看方向', cyclesHeadline: '把遠方，拆成今天的一小步。', cyclesDescription: '設定一段時間的目標與階段，再交給 AI 轉成每天能執行的小週期。', addCycle: '新增大週期', editCycle: '編輯大週期', newCycle: '設定新的大週期', cycleName: '名稱', cycleNameExample: '例如：2027 畢業無縫就業', start: '開始', end: '結束', cycleGoal: '這個週期完成時，我想成為什麼狀態？', cycleGoalPlaceholder: '寫結果，不只寫想做的事。', cycleReward: '完成後，怎麼獎勵自己？', cycleRewardPlaceholder: '例如：安排一天小旅行，或買一本期待已久的書。', status: '狀態', active: '進行中', completed: '已完成', phases: '階段', phasesHint: '每個階段只保留一個清楚的重點。', addPhase: '加入階段', phaseName: '階段名稱', phaseOutcome: '這一段要做到什麼', remove: '移除', cycleDataNote: '資料只存進你的行事曆；按下 AI 拆解時才由你決定貼給哪個 AI。', saving: '正在儲存…', saveCycle: '儲存大週期', loadingCycles: '正在打開你的大週期…', emptyCyclesTitle: '先決定要去哪裡', emptyCyclesText: '新增第一個大週期，再把它拆成幾個有明確結果的階段。', cycleProgress: '大週期進度 {progress}%', cycleTasksDone: '{completed} / {total} 個小週期任務完成', noLinkedTasks: '尚未綁定小週期任務', reward: '完成獎勵', noReward: '還沒設定。替完成目標的自己留一份期待。', noPhases: '尚未設定階段，可以先請 AI 幫你拆分。', copyAiPrompt: '複製 AI 拆解指令', cyclesFooter: '大週期決定方向，小週期負責前進。', cycleAiPrompt: '請依照這個大週期，先讀取日期內既有行事曆，再把每個階段拆成可完成的每日待辦，並將新增任務綁定到對應的大週期與階段。保留原有事項，控制每天工作量，並在排完後讀回確認。\n\n大週期：{title}\n日期：{startDate}～{endDate}\n目標：{goal}\n完成獎勵：{reward}\n階段：\n{phases}', notSet: '尚未設定', phasesNotSet: '- 尚未設定，請先協助拆分階段',
  plannerWelcome: '告訴我你想完成什麼、期限和每週能投入多少時間。我會先讀取相關日期，再提出可以預覽的行事曆計畫。', plannerTemporaryError: 'AI 暫時沒有回應。', plannerApplyError: '無法套用提案。', plannerAppliedCycle: '已建立大週期', plannerAppliedTasks: '新增 {count} 個任務', plannerSkippedTasks: '略過 {count} 個重複任務', plannerApplied: '提案已套用。你可以回到每日或大週期頁面查看。', plannerEyebrow: 'AI PLANNER · 先對話，再寫入', plannerHeadline: '一起把想法，排成做得到的日子。', plannerDescription: 'AI 只會讀取規劃所需的日期；提案在你確認前不會更動行事曆。', plannerNoSave: '對話不保存', plannerNoSaveHint: '離開或重新整理後即清除', plannerSuggestionsTitle: '不知道怎麼開始？', plannerFillPrompt: '填入對話框', plannerCurrentDate: '目前以 {date} 作為「今天」來理解相對日期。', plannerThinking: 'AI 正在規劃', plannerPlaceholder: '例如：我想在十月底完成作品集，每週能投入八小時…', plannerAria: '和 AI 規劃行事曆', send: '送出', pleaseWait: '請稍候', plannerComposerHint: 'Enter 送出 · Shift + Enter 換行。請避免輸入不必要的敏感資料。', proposalLabel: 'AI 行事曆提案', proposalPreview: '提案預覽', proposalTaskCount: '{count} 個新任務', proposalNewCycle: 'NEW MACRO CYCLE', proposalSafety: '套用只會新增內容，既有事項不會被刪除或覆蓋。', proposalApplied: '已套用', proposalApplying: '正在套用…', proposalApply: '確認套用到行事曆', suggestionCycleLabel: '規劃大週期', suggestionCyclePrompt: '我想建立一個新的大週期。請先問我最多三個必要問題，再替我規劃階段、緩衝時間和完成獎勵。', suggestionDailyLabel: '拆成每日任務', suggestionDailyPrompt: '請讀取我進行中的大週期和接下來兩週的既有行事曆，保留原有事項，把目前階段拆成每天可完成的小任務。', suggestionLoadLabel: '檢查是否超載', suggestionLoadPrompt: '請檢查我下週的既有任務和大週期，找出工作量過重或日期衝突的地方，先給我調整建議。', suggestionTodayLabel: '只安排今天', suggestionTodayPrompt: '我今天可投入 90 分鐘，請讀取今天的行事曆，替我挑出最值得新增的兩個小任務，並保留緩衝。', suggestionHabitLabel: '建立習慣', suggestionHabitPrompt: '我想培養一個新習慣。請幫我設計身份、觸發提示、兩分鐘起步，並提出未來兩週的合理安排。', suggestionAdjustLabel: '依進度調整', suggestionAdjustPrompt: '請根據目前大週期的完成進度和接下來兩週的行事曆，提出一份更現實的小週期安排。',
  createdShortCycle: '已建立短週期：每天顯示，共 {count} 天，截止 {date}。', shortCycleDeadlineError: '截止日期需在開始日後 1 至 364 天內。', deadlineBadge: '截止 {date}', shortCycle: '短週期（每天顯示至截止日）', deadline: '截止日期',
  privacyTitle: '隱私權政策', privacyUpdated: '最後更新：2026 年 8 月 29 日', privacyCollectedTitle: '我們收集哪些資料', privacyCollectedText: '為了提供登入與跨裝置同步功能，日常會處理你的帳號識別資訊，例如 Google 提供的使用者識別碼、電子郵件與顯示名稱，或你自行註冊的帳號及經雜湊處理的密碼。我們也會保存你主動輸入的待辦、生活紀錄、心得與規劃資料。', privacyUseTitle: '資料如何使用', privacyUseText: '這些資料只用於驗證身分、顯示你的個人行事曆、在不同裝置同步內容，以及維護服務安全。每個帳號的內容彼此分開，不會公開給其他使用者。', privacyCookiesTitle: '登入與 Cookie', privacyCookiesText: '登入後，網站會使用安全的 HttpOnly Session Cookie 維持登入狀態。使用 Google 登入時，網站只取得完成登入所需的基本個人資料，不會保存 Google access token，也不會存取你的 Google 行事曆、雲端硬碟或其他 Google 內容。', privacyStorageTitle: '儲存與分享', privacyStorageText: '資料儲存在網站的受管資料庫中，並由提供網站執行、資料儲存與登入所需的基礎設施服務商處理。我們不出售個人資料，也不將行事曆內容用於廣告。', privacyAiTitle: 'AI 規劃功能', privacyAiText: '當你主動使用 AI 規劃時，系統會將對話，以及完成該次規劃所需日期內的任務、大週期、階段與每日分段傳送給 Groq 處理。對話不會由日常永久保存，AI 提案也必須經你確認才會寫入行事曆。請避免輸入與規劃無關的敏感資料；Groq 如何處理推論資料，依其最新資料政策為準。', privacyChoicesTitle: '你的選擇', privacyChoicesText: '你可以停止使用本服務，或透過 Google OAuth 同意畫面所列的支援聯絡方式，要求查詢或刪除帳號與內容。', privacyBack: '返回日常',
};

const ja: Record<MessageKey, string> = {
  ...en,
  languageLabel: '言語', brandName: '日々', brandMark: '日', brandHome: '日々に戻る', navLabel: 'カレンダー表示', navDaily: 'デイリー', navCycles: '長期サイクル', navPlanner: 'AIプランナー', signOut: 'ログアウト',
  authEyebrow: '大きな目標を分ける · 小さな行動を習慣に', authHeadline1: 'やりたいことを、', authHeadline2: '今日始められる一歩に。', authDescription: 'AIと一緒に計画・振り返り・調整。今日できる小さなタスクから、続く変化を育てます。', authTabsLabel: 'ログインまたは登録', authLogin: 'ログイン', authRegister: '新規登録', authWelcome: 'おかえりなさい', authCreateTitle: 'あなたの「日々」を始める', authLoginDescription: 'ログイン方法を選んで、今日のページを続けましょう。', authRegisterDescription: 'アカウントを作成すると、端末をまたいで同期できます。', authGoogle: 'Googleで続ける', authDivider: 'またはユーザー名とパスワード', authUsername: 'ユーザー名', authUsernamePlaceholder: '3〜30文字の英数字、_ または -', authPassword: 'パスワード', authPasswordPlaceholder: '10文字以上', authConfirmPassword: 'パスワード確認', authConfirmPlaceholder: 'もう一度入力してください', authPasswordMismatch: 'パスワードが一致しません。', authTaken: 'このユーザー名はすでに使われています。', authCredentials: 'ユーザー名またはパスワードが違います。', authInvalidFormat: 'ユーザー名は3〜30文字、パスワードは10文字以上にしてください。', authUnavailable: '現在ログインできません。しばらくしてからお試しください。', authNetworkError: '接続できませんでした。ネットワークを確認してください。', authPleaseWait: 'お待ちください…', authLoginButton: 'カレンダーを開く', authRegisterButton: '登録して始める', authPrivacy1: 'タスク、記録、振り返りはあなたのアカウントだけに保存されます。', authPrivacyLink: 'プライバシーポリシー',
  noCycle: '長期サイクルに紐づけない', wholeCycle: '{title}（全体）', noSection: '時間帯未設定', syncLoading: 'クラウドから読み込み中…', syncSaving: '同期中…', syncSaved: 'クラウドに同期済み', syncConflict: '別の端末で更新されました。再読み込みしてください。', syncError: '同期できませんでした。接続を確認してください。', createdRecurring: '繰り返しタスクを{count}件作成しました。', addedToday: '今日に追加しました。', taskCreateError: 'タスクを作成できませんでした。', seriesUpdated: 'シリーズ{count}件を更新しました。', seriesUpdateError: '繰り返しシリーズを更新できませんでした。', seriesDeleteConfirm: 'この繰り返しシリーズをすべて削除しますか？全日程から削除されます。', seriesDeleted: 'シリーズ{count}件を削除しました。', seriesDeleteError: '繰り返しシリーズを削除できませんでした。', unnamedSection: '名称未設定', customDeleteConfirm: '「{title}」と全日付の内容を削除しますか？',
  taskUndo: '未完了に戻す：{task}', taskDone: '完了にする：{task}', taskEdit: 'タスクを編集：{task}', taskDelete: '削除：{task}', bindCycle: '長期サイクルに紐づける', scheduleSection: '時間帯を設定', taskCuePlaceholder: 'きっかけ：何の直後に始めますか？', taskTinyPlaceholder: '2分版：最初の最小行動は？', taskIdentityPlaceholder: 'アイデンティティ：どんな人になりますか？', saveThisOccurrence: '今回だけ保存', applySeries: 'シリーズ全体に適用', deleteSeries: 'シリーズ全体を削除', cancel: 'キャンセル', edit: '編集', recurring: '繰り返し', streak: '{count}回連続完了', identity: 'アイデンティティ：{value}', cue: 'きっかけ：「{value}」の後', tinyStart: '2分で始める：{value}', recovery: '前回が未完了です。今回は2分版から始めて、2回連続の未達を防ぎましょう。',
  brandTop: '今日のページ上部へ', dailyEyebrow: '{year}年 · 一日ずつ', dateNav: '日付を切り替える', previousDay: '前日', chooseDate: '日付を選択', nextDay: '翌日', backToday: '今日に戻る', nearbyDates: '前後の日付', completedOnDate: '完了済みタスクがあります', todayTasks: '今日の小さな一歩', progressLabel: '{progress}%完了', progressCount: '{completed} / {total} 完了', startSlowly: '小さく始める', splitDay: '1日を分ける', noSplit: '分けない', splitCount: '{count}分割', sectionName: '時間帯名', sectionHelpActive: 'タスクを下の時間帯へドラッグ。スマホではタスクをタップして選べます。', sectionHelpEmpty: '時間帯を作ると、1日を集中ブロックに分けられます。', newTask: 'タスクを追加', newTaskPlaceholder: '次の小さな一歩は？', repeatHabit: '繰り返しと習慣設計', repeatCycle: '繰り返し', noRepeat: '繰り返さない', repeatDaily: '毎日', repeatWeekly: '毎週', repeatMonthly: '毎月', every: '間隔', repeatEnds: '終了条件', repeatCountMode: '回数', repeatDateMode: '日付', totalOccurrences: '合計回数（今回を含む）', repeatUntil: 'この日まで', identityHabit: 'アイデンティティ習慣（任意）', identityExample: '例：学び続けるエンジニアになる', habitCue: '習慣のきっかけ（任意）', cueExample: '例：朝のコーヒーを淹れた後', twoMinute: '2分版（任意）', twoMinuteExample: '例：問題を開いて入出力を書く', addTaskLabel: 'タスクを追加', blankDay: '今日はまだ白紙です', loadingDay: '今日のページを開いています', blankDayHint: '小さなことを一つで十分です。', waitMoment: '少しお待ちください。', itemCount: '{count}件', dropHere: 'ここにドロップ', unassigned: '未設定', activityTitle: '今日したこと', activityPlaceholder: '今日起きたことを記録…\n\n何を終え、どこへ行き、誰と会いましたか？', reflectionTitle: '今日の振り返り', reflectionPlaceholder: '今日はどう感じましたか？\n明日の自分へ一言残しましょう。', customRecords: 'カスタム記録', customRecordsHint: '一度作れば、毎日同じ項目を使えます。', customFieldExample: '例：LeetCodeメモ', addField: '項目を追加', deleteField: '項目を削除：{title}', delete: '削除', customFieldPlaceholder: '今日の{title}を書く…', noCustomFields: 'カスタム項目はまだありません。「LeetCodeメモ」など毎日追跡したい項目を追加できます。', dailyFooter: '一日一ページ、小さな一歩を重ねよう。',
  cycleSaved: '長期サイクルをクラウドに同期しました。', saveFailed: '保存できませんでした。', aiPromptCopied: 'AI分解プロンプトをコピーしました。AIチャットに貼り付けてください。', cyclesEyebrow: 'MACRO CYCLE · 方向を決める', cyclesHeadline: '遠い目標を、今日の一歩に。', cyclesDescription: '期間・目標・フェーズを決め、AIで毎日の実行可能な行動に変換します。', addCycle: '長期サイクルを追加', editCycle: '長期サイクルを編集', newCycle: '長期サイクルを作成', cycleName: '名前', cycleNameExample: '例：10月までにポートフォリオを公開', start: '開始', end: '終了', cycleGoal: 'このサイクルの終了時、どんな状態になりたいですか？', cycleGoalPlaceholder: '作業ではなく、結果を書きましょう。', cycleReward: '完了したらどう自分を労いますか？', cycleRewardPlaceholder: '例：日帰り旅行をする、欲しかった本を買う。', status: '状態', active: '進行中', completed: '完了', phases: 'フェーズ', phasesHint: '各フェーズは一つの明確な重点に絞ります。', addPhase: 'フェーズを追加', phaseName: 'フェーズ名', phaseOutcome: 'このフェーズで何を実現しますか？', remove: '削除', cycleDataNote: 'データはあなたのカレンダーに保存されます。AIに共有するタイミングはあなたが決めます。', saving: '保存中…', saveCycle: '長期サイクルを保存', loadingCycles: '長期サイクルを読み込み中…', emptyCyclesTitle: 'まず方向を決めましょう', emptyCyclesText: '最初の長期サイクルを作り、明確な結果を持つフェーズに分けます。', cycleProgress: '長期サイクル進捗 {progress}%', cycleTasksDone: '{completed} / {total}件のデイリータスク完了', noLinkedTasks: 'デイリータスクはまだありません', reward: '完了報酬', noReward: 'まだ未設定です。達成した未来の自分に楽しみを用意しましょう。', noPhases: 'フェーズはまだありません。AIに分解を頼めます。', copyAiPrompt: 'AI分解プロンプトをコピー', cyclesFooter: '長期サイクルが方向を決め、毎日の行動が前進をつくる。', cycleAiPrompt: 'この長期サイクルの日付内にある既存カレンダーを読み、既存項目を残したまま各フェーズを実行可能なデイリータスクに分解してください。新しいタスクを対応する長期サイクルとフェーズに紐づけ、毎日の量を現実的に保ち、書き込み後に再読して確認してください。\n\n長期サイクル：{title}\n日付：{startDate}〜{endDate}\n目標：{goal}\n報酬：{reward}\nフェーズ：\n{phases}', notSet: '未設定', phasesNotSet: '- 未設定です。まずフェーズ分けを手伝ってください。',
  plannerWelcome: '達成したいこと、期限、使える時間を教えてください。必要な日付だけを読み、確認できる計画を提案します。', plannerTemporaryError: 'AIプランナーは一時的に利用できません。', plannerApplyError: '提案を適用できませんでした。', plannerAppliedCycle: '長期サイクルを作成', plannerAppliedTasks: '{count}件のタスクを追加', plannerSkippedTasks: '{count}件の重複をスキップ', plannerApplied: '提案を適用しました。デイリーまたは長期サイクルで確認できます。', plannerEyebrow: 'AI PLANNER · 適用前に確認', plannerHeadline: 'アイデアを、実行できる日々へ。', plannerDescription: 'AIは計画に必要な日付だけを読みます。承認するまでカレンダーは変更されません。', plannerNoSave: '会話は保存されません', plannerNoSaveHint: '移動または再読み込みで消去', plannerSuggestionsTitle: '何から始める？', plannerFillPrompt: 'このプロンプトを使う', plannerCurrentDate: '相対日付は{date}を「今日」として解釈します。', plannerThinking: 'AIが計画中', plannerPlaceholder: '例：10月末までにポートフォリオを公開したい。週8時間使えます…', plannerAria: 'AIとカレンダーを計画', send: '送信', pleaseWait: 'お待ちください', plannerComposerHint: 'Enterで送信 · Shift + Enterで改行。不要な機密情報は入力しないでください。', proposalLabel: 'AIカレンダー提案', proposalPreview: '提案プレビュー', proposalTaskCount: '新規タスク{count}件', proposalNewCycle: 'NEW MACRO CYCLE', proposalSafety: '適用は追加のみです。既存項目は削除・上書きされません。', proposalApplied: '適用済み', proposalApplying: '適用中…', proposalApply: 'カレンダーに適用', suggestionCycleLabel: '長期サイクルを計画', suggestionCyclePrompt: '新しい長期サイクルを作りたいです。必要な質問を3つ以内で確認し、フェーズ、余白時間、完了報酬を提案してください。', suggestionDailyLabel: 'デイリータスクに分解', suggestionDailyPrompt: '進行中の長期サイクルと今後2週間の既存カレンダーを読み、既存項目を残したまま現在のフェーズを実行可能なデイリータスクに分解してください。', suggestionLoadLabel: '負荷を確認', suggestionLoadPrompt: '来週の既存タスクと長期サイクルを確認し、過負荷の日や日付の競合を見つけ、変更前に調整案をください。', suggestionTodayLabel: '今日だけ計画', suggestionTodayPrompt: '今日は90分使えます。今日のカレンダーを読み、最も価値のある小さなタスクを2つ選び、余白時間を残してください。', suggestionHabitLabel: '習慣を作る', suggestionHabitPrompt: '新しい習慣のアイデンティティ、きっかけ、2分版、現実的な2週間の予定を設計してください。', suggestionAdjustLabel: '進捗に合わせて調整', suggestionAdjustPrompt: '現在の長期サイクル進捗と今後2週間のカレンダーを使って、より現実的なデイリープランを提案してください。',
  createdShortCycle: '短期サイクルを作成しました。{date}まで毎日、全{count}件です。', shortCycleDeadlineError: '期限は開始日の1〜364日後に設定してください。', deadlineBadge: '期限 {date}', shortCycle: '短期サイクル（期限まで毎日）', deadline: '期限',
  privacyTitle: 'プライバシーポリシー', privacyUpdated: '最終更新：2026年8月29日', privacyCollectedTitle: '収集する情報', privacyCollectedText: 'ログインと端末間同期のため、GoogleユーザーID、メールアドレス、表示名、または登録ユーザー名とハッシュ化されたパスワードなどのアカウント識別情報を処理します。また、入力したタスク、活動記録、振り返り、計画データを保存します。', privacyUseTitle: '情報の利用方法', privacyUseText: '認証、個人カレンダーの表示、端末間同期、サービス保護のためだけに使用します。各アカウントの内容は他のユーザーから分離されています。', privacyCookiesTitle: 'ログインとCookie', privacyCookiesText: 'ログイン後は安全なHttpOnlyセッションCookieでログイン状態を維持します。Googleログインでは認証に必要な基本プロフィールのみを取得し、Googleアクセストークンを保存せず、Googleカレンダー、ドライブ、その他のコンテンツにはアクセスしません。', privacyStorageTitle: '保存と共有', privacyStorageText: 'データは本サイトのマネージドデータベースに保存され、運用に必要なインフラ提供者によって処理されます。個人情報を販売したり、カレンダー内容を広告に使用したりしません。', privacyAiTitle: 'AI計画', privacyAiText: 'AI計画を選ぶと、会話と計画に必要な最小限のタスク、長期サイクル、フェーズ、時間帯がGroqに送信されます。会話は恒久保存されず、提案は承認するまでカレンダーを変更しません。無関係な機密情報を入力せず、Groqの最新データポリシーを確認してください。', privacyChoicesTitle: 'あなたの選択', privacyChoicesText: 'サービスの利用を停止するか、Google OAuth同意画面のサポート連絡先からアカウントと内容の開示・削除を依頼できます。', privacyBack: '日々に戻る',
};

const dictionaries: Record<Language, Record<MessageKey, string>> = { en, zh, ja };
const localeByLanguage: Record<Language, string> = { en: 'en-US', zh: 'zh-TW', ja: 'ja-JP' };
const documentLanguage: Record<Language, string> = { en: 'en', zh: 'zh-Hant', ja: 'ja' };
const STORAGE_KEY = 'daybook-language';
const LANGUAGE_EVENT = 'daybook-language-change';

function readLanguage(): Language {
  const saved = window.localStorage.getItem(STORAGE_KEY);
  return saved === 'zh' || saved === 'ja' ? saved : 'en';
}

function subscribeLanguage(listener: () => void) {
  window.addEventListener('storage', listener);
  window.addEventListener(LANGUAGE_EVENT, listener);
  return () => {
    window.removeEventListener('storage', listener);
    window.removeEventListener(LANGUAGE_EVENT, listener);
  };
}

type I18nValue = {
  language: Language;
  locale: string;
  setLanguage: (language: Language) => void;
  t: (key: MessageKey, variables?: Record<string, string | number>) => string;
};

const I18nContext = createContext<I18nValue | null>(null);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const language = useSyncExternalStore(subscribeLanguage, readLanguage, () => 'en');

  useEffect(() => {
    document.documentElement.lang = documentLanguage[language];
  }, [language]);

  const setLanguage = useCallback((next: Language) => {
    window.localStorage.setItem(STORAGE_KEY, next);
    window.dispatchEvent(new Event(LANGUAGE_EVENT));
  }, []);

  const t = useCallback((key: MessageKey, variables?: Record<string, string | number>) => {
    const message = dictionaries[language][key];
    if (!variables) return message;
    return message.replace(/\{(\w+)\}/g, (match, name: string) =>
      variables[name] === undefined ? match : String(variables[name]),
    );
  }, [language]);

  const value = useMemo(() => ({ language, locale: localeByLanguage[language], setLanguage, t }), [language, setLanguage, t]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const value = useContext(I18nContext);
  if (!value) throw new Error('useI18n must be used inside LanguageProvider');
  return value;
}

export function LanguageSwitcher() {
  const { language, setLanguage, t } = useI18n();
  return (
    <div className="language-switcher" aria-label={t('languageLabel')} role="group">
      {([['en', 'EN'], ['zh', '中'], ['ja', '日']] as const).map(([value, label]) => (
        <button key={value} type="button" className={language === value ? 'active' : ''} onClick={() => setLanguage(value)} aria-pressed={language === value}>{label}</button>
      ))}
    </div>
  );
}

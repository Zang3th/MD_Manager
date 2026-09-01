interface Window {
  MDManager: any;
  showOpenFilePicker(options?: any): Promise<any[]>;
  showSaveFilePicker(options?: any): Promise<any>;
}

interface Element {
  hidden: boolean;
  disabled: boolean;
  style: CSSStyleDeclaration;
  dataset: DOMStringMap;
  offsetHeight: number;
  offsetWidth: number;
}

interface EventTarget {
  closest(selectors: string): Element;
  setAttribute(qualifiedName: string, value: string): void;
}

interface Document {
  getElementById(elementId: string): HTMLElement;
  querySelector<K extends keyof HTMLElementTagNameMap>(selectors: K): HTMLElementTagNameMap[K];
  querySelector<E extends Element = Element>(selectors: string): E;
}

interface Element {
  querySelector<K extends keyof HTMLElementTagNameMap>(selectors: K): HTMLElementTagNameMap[K];
  querySelector<E extends Element = Element>(selectors: string): E;
}

declare const Sortable: {
  create(element: Element, options: any): { destroy(): void };
};

type MDTodo = { type: "todo"; lineIndex: number; checked: boolean; text: string };
type MDNoteItem = { text: string; indent?: number; paragraph?: boolean };
type MDNote = { type: string; noteType?: string; items: MDNoteItem[] };
type MDGroupSection = { lineIndex: number; descriptions: MDParagraphBlock[]; todos: MDTodo[] };
type MDGroupBlock = { type: "group"; title: string; lineIndex: number; descriptions: MDParagraphBlock[]; todos: MDTodo[]; sections: MDGroupSection[] };
type MDNoteBlock = { type: "note"; noteType: string; lineIndex: number; items: MDNoteItem[] };
type MDParagraphBlock = { type: "paragraph"; text: string };
type MDTaskContent = { blocks: Array<MDGroupBlock | MDNoteBlock | MDParagraphBlock>; todos: MDTodo[] };
type MDTask = { title: string; lines: string[]; ignored?: boolean };
type MDFeature = {
  title: string;
  headerLines: string[];
  version: string;
  dates: Array<{from: string; to: string}>;
  notes: MDNote[];
  tasks: MDTask[];
  isBacklog: boolean;
  isArchived?: boolean;
  isPinned?: boolean;
  ignored?: boolean;
};
type MDMarkdownWarning = { lineNumber: number; message: string };
type MDProject = { title: string; newline: string; beforeFeatures: string[]; features: MDFeature[]; warnings: MDMarkdownWarning[]; hasArchive?: boolean; archiveTitle?: string };
type MDArchiveScale = "day" | "week" | "month" | "year";
type MDArchiveDate = { value: string; time: number; year: number; month: number; day: number };
type MDArchiveTickLevel = "major" | "minor";
type MDArchiveHeaderCell = { label: string; position: number; width: number };
type MDArchiveTick = { time: number; level: MDArchiveTickLevel; label: string; position: number; labelPosition: number };
type MDArchiveTimelineSegment = { startDay: number; endDay: number; endExclusive: number; durationDays: number; label: string; position: number; width: number };
type MDArchiveTimelinePoint = { day: number; label: string; position: number };
type MDArchiveTimelinePause = { startDay: number; endExclusive: number; durationDays: number; label: string; position: number; width: number };
type MDArchiveTimelineLane = { feature: MDFeature; startDay: number; endExclusive: number; ranges: MDArchiveTimelineSegment[]; points: MDArchiveTimelinePoint[]; pauses: MDArchiveTimelinePause[]; accessibleSummary: string };
type MDArchiveTimeline = { scale: MDArchiveScale; from: string; to: string; headerCells: MDArchiveHeaderCell[]; rulerPerCell: number; lanes: MDArchiveTimelineLane[]; ticks: MDArchiveTick[]; unmatched: MDFeature[] };
type MDUndoAction = {
  label: string;
  undo(): void;
  redo(): boolean | void;
  size?: number;
  beforeViewState?: MDViewState;
  afterViewState?: MDViewState;
};
type MDUndoEntry = MDUndoAction & { size: number };
type MDSearchKind = "feature" | "task" | "group" | "todo" | "note" | "text";
type MDSearchBadge = "feature" | "task" | "group" | "todo" | "info" | "warn" | "text";
type MDSearchNoteType = "info" | "warn";
type MDSearchLocation = "workspace" | "backlog" | "archive";
type MDSearchState = "done" | "active" | "open" | "";
type MDSearchItem = {
  kind: MDSearchKind;
  badge: MDSearchBadge;
  text: string;
  lower: string;
  featureIndex: number;
  taskIndex: number;
  taskPosition: number;
  noteType: MDSearchNoteType | "";
  itemIndex: number;
  lineIndex: number;
  location: MDSearchLocation;
  state: MDSearchState;
  breadcrumb: string[];
};
type MDSearchResult = { item: MDSearchItem; score: number; positions: number[] };
type MDSearchIndex = { items: MDSearchItem[]; narrow: { query: string; items: MDSearchItem[] } | null };
type MDUndoSystem = { entries: MDUndoEntry[]; index: number; totalSize: number };
type MDUndoResult = { label: string; viewState?: MDViewState };
type MDFileHandle = {
  name: string;
  getFile(): Promise<{text(): Promise<string>; lastModified?: number; size?: number}>;
  queryPermission(options: {mode: "read" | "readwrite"}): Promise<PermissionState>;
  requestPermission(options: {mode: "read" | "readwrite"}): Promise<PermissionState>;
  createWritable(): Promise<{write(value: string): Promise<void>; close(): Promise<void>}>;
  isSameEntry(other: MDFileHandle): Promise<boolean>;
};
type MDRecentFile = { id: string; name: string; projectTitle?: string; featureWidth?: 380 | 460 | 540; handle: MDFileHandle; openedAt: number };
type MDOpenedFile = {handle: MDFileHandle; markdown: string; stamp?: string};
type MDViewState = {
  tasks: boolean[];
  featureNotes: boolean[];
  view: "workspace" | "archive";
  archiveOpenFeature: number | null;
  backlogOpen: boolean;
  statsOpen: boolean;
  featureScrolls: Array<{left: number; top: number}>;
  contentScrollLeft: number;
  contentScrollTop: number;
  archiveScrollLeft: number;
  archiveScrollTop: number;
  backlogScrollLeft: number;
  backlogScrollTop: number;
  focusSelector?: string;
};

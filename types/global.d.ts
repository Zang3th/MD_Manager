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
  ignored?: boolean;
};
type MDProject = { title: string; newline: string; beforeFeatures: string[]; features: MDFeature[] };
type MDUndoAction = {
  label: string;
  undo(): void;
  redo(): boolean | void;
  size?: number;
  beforeViewState?: MDViewState;
  afterViewState?: MDViewState;
};
type MDUndoEntry = MDUndoAction & { size: number; beforeRevision: number; afterRevision: number };
type MDUndoSystem = { entries: MDUndoEntry[]; index: number; revision: number; savedRevision: number; nextRevision: number; totalSize: number };
type MDUndoResult = { label: string; viewState?: MDViewState };
type MDFileHandle = {
  name: string;
  getFile(): Promise<{text(): Promise<string>; lastModified?: number; size?: number}>;
  queryPermission(options: {mode: "read" | "readwrite"}): Promise<PermissionState>;
  requestPermission(options: {mode: "read" | "readwrite"}): Promise<PermissionState>;
  createWritable(): Promise<{write(value: string): Promise<void>; close(): Promise<void>}>;
  isSameEntry(other: MDFileHandle): Promise<boolean>;
};
type MDRecentFile = { id: string; name: string; projectTitle?: string; handle: MDFileHandle; openedAt: number };
type MDOpenedFile = {handle: MDFileHandle; markdown: string; stamp?: string};
type MDViewState = {
  tasks: boolean[];
  featureNotes: boolean[];
  backlogOpen: boolean;
  featureScrolls: Array<{left: number; top: number}>;
  contentScrollLeft: number;
  contentScrollTop: number;
  backlogScrollLeft: number;
  backlogScrollTop: number;
  focusSelector?: string;
};

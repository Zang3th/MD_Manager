interface Window {
  MDManager: any;
  showOpenFilePicker(options?: any): Promise<any[]>;
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
type MDGroupBlock = { type: "group"; title: string; lineIndex: number; todos: MDTodo[] };
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
type MDHistory = { entries: string[]; index: number };
type MDFileHandle = {
  name: string;
  getFile(): Promise<{text(): Promise<string>}>;
  queryPermission(options: {mode: "read" | "readwrite"}): Promise<PermissionState>;
  requestPermission(options: {mode: "read" | "readwrite"}): Promise<PermissionState>;
  createWritable(): Promise<{write(value: string): Promise<void>; close(): Promise<void>}>;
  isSameEntry(other: MDFileHandle): Promise<boolean>;
};
type MDRecentFile = { id: string; name: string; handle: MDFileHandle; openedAt: number };
type MDOpenedFile = {handle: MDFileHandle; markdown: string};
type MDViewState = {
  tasks: boolean[];
  featureNotes: boolean[];
  backlogOpen: boolean;
  featureScrolls: Array<{left: number; top: number}>;
  contentScrollLeft: number;
  contentScrollTop: number;
  backlogScrollLeft: number;
  backlogScrollTop: number;
};

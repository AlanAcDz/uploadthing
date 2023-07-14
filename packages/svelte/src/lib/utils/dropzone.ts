import accepts from "attr-accept";
import type { FileWithPath } from "file-selector";
import { get, writable } from "svelte/store";

export type FileAccept =
  | string
  | string[]
  | {
      [key: string]: string[];
    };
export type FileHandler = (evt: Event) => void;

type FileErrorCode =
  | "file-invalid-type"
  | "file-too-large"
  | "file-too-small"
  | "too-many-files"
  | string;

type FileRejectionError =
  | { code: FileErrorCode; message: string }
  | null
  | boolean;

export type InputFile = (FileWithPath | DataTransferItem) & { size?: number };

export type FileRejectReason = {
  file: InputFile;
  errors: FileRejectionError[];
};

export interface FileUploadOptions {
  accept: FileAccept;
  disabled: boolean;
  getFilesFromEvent: (evt: Event | any) => Promise<InputFile[]>;
  maxSize: number;
  minSize: number;
  multiple: boolean;
  maxFiles: number;
  onDragEnter: FileHandler;
  onDragLeave: FileHandler;
  onDragOver: FileHandler;
  onDrop: (
    acceptedFiles: any[],
    rejectReasons: FileRejectReason[],
    event: Event,
  ) => void;
  onDropAccepted: (acceptedFiles: InputFile[], event: Event) => void;
  onDropRejected: (rejectReasons: FileRejectReason[], event: Event) => void;
  onFileDialogCancel: () => void;
  preventDropOnDocument: boolean;
  noClick: boolean;
  noKeyboard: boolean;
  noDrag: boolean;
  noDragEventsBubbling: boolean;
}

export interface FileUploadInitState {
  isFocused: boolean;
  isFileDialogActive: boolean;
  isDragAccept: boolean;
  isDragActive: boolean;
  isDragReject: boolean;
  draggedFiles: InputFile[];
  acceptedFiles: InputFile[];
  fileRejections: FileRejectReason[];
}

export type ComposeFunction = (event: Event, ...args: unknown[]) => void;

function isIe(userAgent: string) {
  return userAgent.includes("MSIE") || userAgent.includes("Trident/");
}

function isEdge(userAgent: string) {
  return userAgent.includes("Edge/");
}

export function isIeOrEdge(
  userAgent: string = window.navigator.userAgent,
): boolean {
  return isIe(userAgent) || isEdge(userAgent);
}

export function onDocumentDragOver(event: Event): void {
  event.preventDefault();
}

export function isEvtWithFiles(
  event:
    | (Event & {
        dataTransfer?: { types: string };
        target?: EventTarget & { files: InputFile[] };
      })
    | Event,
): boolean {
  if (!("dataTransfer" in event)) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    return !!(event.target && (event.target as any).files);
  }
  if (!event.dataTransfer) {
    return !!event.target && !!event.target.files;
  }
  // https://developer.mozilla.org/en-US/docs/Web/API/DataTransfer/types
  // https://developer.mozilla.org/en-US/docs/Web/API/HTML_Drag_and_Drop_API/Recommended_drag_types#file
  return Array.prototype.some.call(
    event.dataTransfer.types,
    (type) => type === "Files" || type === "application/x-moz-file",
  );
}

export function isPropagationStopped(
  event: Event & { isPropagationStopped?: () => boolean },
): boolean {
  if (typeof event.isPropagationStopped === "function") {
    return event.isPropagationStopped();
  }
  if (typeof event.cancelBubble !== "undefined") {
    return event.cancelBubble;
  }
  return false;
}

export const FILE_INVALID_TYPE = "file-invalid-type";
export const FILE_TOO_LARGE = "file-too-large";
export const FILE_TOO_SMALL = "file-too-small";
export const TOO_MANY_FILES = "too-many-files";

export const TOO_MANY_FILES_REJECTION: FileRejectionError = {
  code: TOO_MANY_FILES,
  message: "Too many files",
};

// File Errors
export const getInvalidTypeRejectionErr = (
  accept: FileAccept,
): FileRejectionError => {
  accept = Array.isArray(accept) && accept.length === 1 ? accept[0] : accept;
  const messageSuffix = Array.isArray(accept)
    ? `one of ${accept.join(", ")}`
    : accept;
  return {
    code: FILE_INVALID_TYPE,
    message: `File type must be ${messageSuffix}`,
  };
};

function isDefined(value: any) {
  return value !== undefined && value !== null;
}

export function normalizeAccept(accept: FileAccept): string | string[] {
  if (typeof accept === "string") {
    return accept;
  }
  if (Array.isArray(accept)) {
    return accept;
  }
  if (typeof accept === "object") {
    return Object.values(accept).flat();
  }
  return [];
}

// Firefox versions prior to 53 return a bogus MIME type for every file drag, so dragovers with
// that MIME type will always be accepted
export function fileAccepted(
  file: InputFile,
  accept: FileAccept,
): [boolean, null | FileRejectionError] {
  const normalizedAccept = normalizeAccept(accept);
  const isAcceptable =
    file.type === "application/x-moz-file" || accepts(file, normalizedAccept);
  return [
    isAcceptable,
    isAcceptable ? null : getInvalidTypeRejectionErr(accept),
  ];
}

export const getTooLargeRejectionErr = (
  maxSize: number,
): FileRejectionError => ({
  code: FILE_TOO_LARGE,
  message: `File is larger than ${maxSize} bytes`,
});

export const getTooSmallRejectionErr = (
  minSize: number,
): FileRejectionError => ({
  code: FILE_TOO_SMALL,
  message: `File is smaller than ${minSize} bytes`,
});

export function fileMatchSize(
  file: InputFile,
  minSize: number,
  maxSize: number,
) {
  if (isDefined(file.size) && file.size) {
    if (isDefined(minSize) && isDefined(maxSize)) {
      if (file.size > maxSize) return [false, getTooLargeRejectionErr(maxSize)];
      if (file.size < minSize) return [false, getTooSmallRejectionErr(minSize)];
    } else if (isDefined(minSize) && file.size < minSize) {
      return [false, getTooSmallRejectionErr(minSize)];
    } else if (isDefined(maxSize) && file.size > maxSize) {
      return [false, getTooLargeRejectionErr(maxSize)];
    }
  }
  return [true, null];
}

export function composeEventHandlers(...fns: any[]): ComposeFunction {
  return (event: Event, ...args: unknown[]) =>
    fns.some((fn: (...args: unknown[]) => void) => {
      if (!isPropagationStopped(event) && fn) {
        fn(event, ...args);
      }
      return isPropagationStopped(event);
    });
}

function reducer(
  state: FileUploadInitState,
  action: { type: string } & Partial<FileUploadInitState>,
) {
  switch (action.type) {
    case "focus":
      return {
        ...state,
        isFocused: true,
      };
    case "blur":
      return {
        ...state,
        isFocused: false,
      };
    case "openDialog":
      return {
        ...state,
        isFileDialogActive: true,
      };
    case "closeDialog":
      return {
        ...state,
        isFileDialogActive: false,
      };
    case "setDraggedFiles":
      const { isDragActive, draggedFiles } = action;
      return {
        ...state,
        draggedFiles: draggedFiles ?? [],
        isDragActive: isDragActive ?? false,
      };
    case "setFiles":
      return {
        ...state,
        acceptedFiles: action.acceptedFiles ?? [],
        fileRejections: action.fileRejections ?? [],
      };
    case "reset":
      return {
        ...state,
        isFileDialogActive: false,
        isDragActive: false,
        draggedFiles: [],
        acceptedFiles: [],
        fileRejections: [],
      };
    default:
      return state;
  }
}

export function useDropzoneReducer(initialState: FileUploadInitState) {
  const state = writable(initialState);
  const dispatch = (
    action: { type: string } & Partial<FileUploadInitState>,
  ) => {
    const newState = reducer(get(state), action);
    state.set(newState);
  };
  return [state, dispatch] as const;
}
import type { ExternalToast } from "sonner";

export type ToastKind = "success" | "error";

export interface ToastRequest {
  kind: ToastKind;
  message: string;
  options?: ExternalToast;
}

type ToastHandler = (request: ToastRequest) => void;

let handler: ToastHandler | undefined;

export function connectToastHandler(nextHandler: ToastHandler) {
  handler = nextHandler;
  return () => {
    if (handler === nextHandler) handler = undefined;
  };
}

function notify(kind: ToastKind, message: string, options?: ExternalToast) {
  const request: ToastRequest =
    options === undefined ? { kind, message } : { kind, message, options };
  handler?.(request);
}

export const toast = {
  success: (message: string, options?: ExternalToast) => notify("success", message, options),
  error: (message: string, options?: ExternalToast) => notify("error", message, options),
};

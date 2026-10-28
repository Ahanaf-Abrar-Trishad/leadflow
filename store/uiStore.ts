import { create } from "zustand";

export type ToastVariant = "info" | "success" | "warning" | "error";

export interface ToastAction {
  label: string;
  onAction: () => void;
}

export interface ToastMessage {
  id: string;
  variant: ToastVariant;
  message: string;
  action?: ToastAction;
}

interface UIState {
  toasts: ToastMessage[];
  showToast: (
    variant: ToastVariant,
    message: string,
    action?: ToastAction,
  ) => void;
  dismissToast: (id: string) => void;
}

export const useUIStore = create<UIState>((set) => ({
  toasts: [],
  showToast: (variant, message, action) =>
    set((state) => ({
      toasts: [
        ...state.toasts,
        { id: crypto.randomUUID(), variant, message, action },
      ],
    })),
  dismissToast: (id) =>
    set((state) => ({
      toasts: state.toasts.filter((toast) => toast.id !== id),
    })),
}));

"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import ConfirmModal from "@/components/ConfirmModal";
import PromptModal from "@/components/PromptModal";

type ConfirmOptions = {
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "default" | "danger";
};

type PromptOptions = {
  title: string;
  description: string;
  initialValue?: string;
  placeholder?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  required?: boolean;
};

type DialogContextValue = {
  showConfirm: (options: ConfirmOptions) => Promise<boolean>;
  showPrompt: (options: PromptOptions) => Promise<string | null>;
};

const DialogContext = createContext<DialogContextValue | null>(null);

export default function AppDialogProvider({ children }: { children: ReactNode }) {
  const [confirmOptions, setConfirmOptions] = useState<ConfirmOptions | null>(null);
  const [promptOptions, setPromptOptions] = useState<PromptOptions | null>(null);
  const confirmResolver = useRef<((result: boolean) => void) | null>(null);
  const promptResolver = useRef<((result: string | null) => void) | null>(null);

  const showConfirm = useCallback((options: ConfirmOptions) => new Promise<boolean>((resolve) => {
    confirmResolver.current?.(false);
    confirmResolver.current = resolve;
    setConfirmOptions(options);
  }), []);

  const showPrompt = useCallback((options: PromptOptions) => new Promise<string | null>((resolve) => {
    promptResolver.current?.(null);
    promptResolver.current = resolve;
    setPromptOptions(options);
  }), []);

  const closeConfirm = (result: boolean) => {
    confirmResolver.current?.(result);
    confirmResolver.current = null;
    setConfirmOptions(null);
  };

  const closePrompt = (result: string | null) => {
    promptResolver.current?.(result);
    promptResolver.current = null;
    setPromptOptions(null);
  };

  const value = useMemo(() => ({ showConfirm, showPrompt }), [showConfirm, showPrompt]);

  return (
    <DialogContext.Provider value={value}>
      {children}
      <ConfirmModal
        open={Boolean(confirmOptions)}
        title={confirmOptions?.title ?? "Please confirm"}
        description={confirmOptions?.description ?? ""}
        confirmLabel={confirmOptions?.confirmLabel}
        cancelLabel={confirmOptions?.cancelLabel}
        tone={confirmOptions?.tone}
        onConfirm={() => closeConfirm(true)}
        onCancel={() => closeConfirm(false)}
      />
      <PromptModal
        open={Boolean(promptOptions)}
        title={promptOptions?.title ?? "Further information"}
        description={promptOptions?.description ?? ""}
        initialValue={promptOptions?.initialValue}
        placeholder={promptOptions?.placeholder}
        confirmLabel={promptOptions?.confirmLabel}
        cancelLabel={promptOptions?.cancelLabel}
        required={promptOptions?.required}
        onConfirm={(value) => closePrompt(value)}
        onCancel={() => closePrompt(null)}
      />
    </DialogContext.Provider>
  );
}

export function useAppDialog() {
  const value = useContext(DialogContext);
  if (!value) throw new Error("useAppDialog must be used within AppDialogProvider");
  return value;
}

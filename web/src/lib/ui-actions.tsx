import { createContext, useContext } from 'react';

export type UiActions = {
  openQuickAdd: () => void;
  openTransaction: (id: number) => void;
  openPalette: () => void;
};

export const UiActionsContext = createContext<UiActions>({
  openQuickAdd: () => {},
  openTransaction: () => {},
  openPalette: () => {},
});

export const useUiActions = () => useContext(UiActionsContext);

/** True when the user is typing somewhere, so single-key shortcuts must not fire. */
export function isTyping(e: KeyboardEvent) {
  const el = e.target as HTMLElement | null;
  return !!el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName));
}

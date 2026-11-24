const INTERACTIVE_TARGETS = 'button,a,input,select,textarea,summary,[role="button"]';

export function openOrderOnDoubleClick(event, open) {
  if (event.target.closest(INTERACTIVE_TARGETS)) return;
  open();
}

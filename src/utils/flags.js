// Product switches for behaviour changes that wait on a decision (plan §10). Each one is a
// single line to flip; both branches stay tested.
export const FLAGS = {
  // C-02b (BTN-6): a tap on the body of a counter card (volume, timed, at most) opens the
  // habit's detail sheet on Today instead of adding a step. Isaac's review page item 6:
  // default in force; `false` restores the old +1 body tap.
  counterBodyOpensDetail: true,
};

export default FLAGS;

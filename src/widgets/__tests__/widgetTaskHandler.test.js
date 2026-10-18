// C-09 review n3: a widget check-off cancels every pending "Streak news" note (the prediction
// it carries may now be wrong); other widget events leave them alone.
jest.mock('../TodayWidget', () => ({ TodayWidget: () => null }));
jest.mock('../widgetData', () => ({
  WIDGET_NAME: 'GroovToday',
  loadTodayForWidget: jest.fn(async () => ({ theme: 'system', rows: [], done: 0, total: 0 })),
  applyWidgetToggle: jest.fn(async () => 1),
  rowsForHeight: () => 3,
}));
jest.mock('../../i18n', () => ({ initLocale: jest.fn(async () => {}) }));
jest.mock('../../utils/notifications', () => ({ cancelStreakNews: jest.fn(async () => {}) }));

const { widgetTaskHandler } = require('../widgetTaskHandler');
const { applyWidgetToggle } = require('../widgetData');
const { cancelStreakNews } = require('../../utils/notifications');

const base = (extra) => ({ widgetInfo: { widgetName: 'GroovToday', height: 200 }, renderWidget: jest.fn(), ...extra });

beforeEach(() => jest.clearAllMocks());

test('a habit toggle applies, cancels Streak news, then re-renders', async () => {
  const order = [];
  applyWidgetToggle.mockImplementationOnce(async () => { order.push('toggle'); return 1; });
  cancelStreakNews.mockImplementationOnce(async () => { order.push('cancel'); });
  const props = base({ widgetAction: 'WIDGET_CLICK', clickAction: 'TOGGLE_HABIT', clickActionData: { habitId: 42 } });
  props.renderWidget.mockImplementation(() => order.push('render'));
  await widgetTaskHandler(props);
  expect(applyWidgetToggle).toHaveBeenCalledWith('42');
  expect(order).toEqual(['toggle', 'cancel', 'render']);
});

test('updates, resizes and other widgets never touch the notes', async () => {
  await widgetTaskHandler(base({ widgetAction: 'WIDGET_UPDATE' }));
  await widgetTaskHandler(base({ widgetAction: 'WIDGET_RESIZED' }));
  await widgetTaskHandler(base({ widgetAction: 'WIDGET_CLICK', clickAction: 'OPEN_APP' }));
  await widgetTaskHandler({ ...base({ widgetAction: 'WIDGET_CLICK', clickAction: 'TOGGLE_HABIT', clickActionData: { habitId: 1 } }), widgetInfo: { widgetName: 'Other' } });
  expect(cancelStreakNews).not.toHaveBeenCalled();
});

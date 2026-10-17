// Render tests for the native TimePicker (S-07): Android opens the system dialog, iOS renders the
// spinner card; both hand back the stored { hour12, minute, ampm } shape.
const React = require('react');
const TestRenderer = require('react-test-renderer');
const { act } = TestRenderer;
const { Modal, Platform } = require('react-native');

jest.mock('@react-native-community/datetimepicker', () => {
  const ReactMock = require('react');
  const Picker = (props) => ReactMock.createElement('RNDateTimePicker', props);
  return {
    __esModule: true,
    default: Picker,
    DateTimePickerAndroid: { open: jest.fn(), dismiss: jest.fn() },
  };
});
jest.mock('expo-localization', () => ({ getCalendars: jest.fn(() => [{ uses24hourClock: false }]) }));
jest.mock('../../utils/haptics', () => ({ lightImpact: jest.fn() }));

const { DateTimePickerAndroid } = require('@react-native-community/datetimepicker');
const { getCalendars } = require('expo-localization');
const TimePicker = require('../TimePicker').default;
const { themes } = require('../../theme/colors');

global.IS_REACT_ACT_ENVIRONMENT = true;

const originalOS = Platform.OS;
afterEach(() => {
  Platform.OS = originalOS;
  jest.clearAllMocks();
});

function render(extra = {}) {
  const props = {
    visible: true, hour12: 7, minute: 45, ampm: 'AM', theme: themes.light,
    onClose: jest.fn(), onSave: jest.fn(), ...extra,
  };
  let renderer;
  act(() => { renderer = TestRenderer.create(React.createElement(TimePicker, props)); });
  return { renderer, props };
}

describe('Android', () => {
  beforeEach(() => { Platform.OS = 'android'; });

  it('opens the system time dialog at the stored time and leaves is24Hour to the device', () => {
    render();
    expect(DateTimePickerAndroid.open).toHaveBeenCalledTimes(1);
    const opts = DateTimePickerAndroid.open.mock.calls[0][0];
    expect(opts.mode).toBe('time');
    expect('is24Hour' in opts).toBe(false);
    expect([opts.value.getHours(), opts.value.getMinutes()]).toEqual([7, 45]);
  });

  it('saves the picked time in the stored 12-hour shape', () => {
    const { props } = render();
    const { onChange } = DateTimePickerAndroid.open.mock.calls[0][0];
    act(() => { onChange({ type: 'set' }, new Date(2026, 9, 17, 19, 5)); });
    expect(props.onSave).toHaveBeenCalledWith({ hour12: 7, minute: 5, ampm: 'PM' });
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });

  it('Back or Cancel (dismissed) closes without saving', () => {
    const { props } = render();
    const { onChange } = DateTimePickerAndroid.open.mock.calls[0][0];
    act(() => { onChange({ type: 'dismissed' }, undefined); });
    expect(props.onSave).not.toHaveBeenCalled();
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });

  it('does not re-open on a parent re-render, and dismisses the dialog if unmounted while open', () => {
    const { renderer, props } = render();
    act(() => { renderer.update(React.createElement(TimePicker, { ...props, onClose: jest.fn() })); });
    expect(DateTimePickerAndroid.open).toHaveBeenCalledTimes(1);
    act(() => { renderer.unmount(); });
    expect(DateTimePickerAndroid.dismiss).toHaveBeenCalledWith('time');
  });

  it('ignores the late dismissed event that its own unmount dismiss triggers', () => {
    const { renderer, props } = render();
    const { onChange } = DateTimePickerAndroid.open.mock.calls[0][0];
    act(() => { renderer.unmount(); });
    act(() => { onChange({ type: 'dismissed' }, undefined); });
    expect(props.onClose).not.toHaveBeenCalled();
    expect(props.onSave).not.toHaveBeenCalled();
  });

  it('closes when the native dialog fails to open', () => {
    const { renderer, props } = render();
    const { onError } = DateTimePickerAndroid.open.mock.calls[0][0];
    act(() => { onError(new Error('ERROR_NO_ACTIVITY')); });
    expect(props.onClose).toHaveBeenCalledTimes(1);
    expect(props.onSave).not.toHaveBeenCalled();
    act(() => { renderer.unmount(); });
    expect(DateTimePickerAndroid.dismiss).not.toHaveBeenCalled();
  });

  it('does not dismiss again after the dialog already closed', () => {
    const { renderer } = render();
    const { onChange } = DateTimePickerAndroid.open.mock.calls[0][0];
    act(() => { onChange({ type: 'set' }, new Date(2026, 9, 17, 8, 0)); });
    act(() => { renderer.unmount(); });
    expect(DateTimePickerAndroid.dismiss).not.toHaveBeenCalled();
  });
});

describe('iOS', () => {
  beforeEach(() => { Platform.OS = 'ios'; });

  const pickerOf = (r) => r.root.find(n => n.type === 'RNDateTimePicker');
  const button = (r, label) => r.root.find(
    n => n.props.accessibilityRole === 'button' && typeof n.props.onPress === 'function'
      && n.findAll(c => c.props.children === label).length > 0,
  );

  it('renders a spinner time picker in a Modal that closes on back', () => {
    const { renderer, props } = render();
    const picker = pickerOf(renderer);
    expect(picker.props.mode).toBe('time');
    expect(picker.props.display).toBe('spinner');
    expect(renderer.root.findByType(Modal).props.onRequestClose).toBe(props.onClose);
  });

  it('Save returns the spun time; Cancel saves nothing', () => {
    const { renderer, props } = render();
    act(() => { pickerOf(renderer).props.onChange({ type: 'set' }, new Date(2026, 9, 17, 0, 30)); });
    act(() => { button(renderer, 'Save').props.onPress(); });
    expect(props.onSave).toHaveBeenCalledWith({ hour12: 12, minute: 30, ampm: 'AM' });

    const second = render();
    act(() => { button(second.renderer, 'Cancel').props.onPress(); });
    expect(second.props.onSave).not.toHaveBeenCalled();
    expect(second.props.onClose).toHaveBeenCalledTimes(1);
  });

  it('formats the preview with the device clock', () => {
    getCalendars.mockReturnValue([{ uses24hourClock: true }]);
    const { renderer } = render();
    expect(renderer.root.findAll(n => n.props.children === '07:45').length).toBeGreaterThan(0);
    act(() => { pickerOf(renderer).props.onChange({ type: 'set' }, new Date(2000, 0, 1, 21, 5)); });
    expect(renderer.root.findAll(n => n.props.children === '21:05').length).toBeGreaterThan(0);
    getCalendars.mockReturnValue([{ uses24hourClock: false }]);
  });
});

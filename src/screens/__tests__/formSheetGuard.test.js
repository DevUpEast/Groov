// F-09b review: the forms' discard guard, rendered. The habit form asks before Android back
// closes it once a field changed and closes at once when clean; the challenge form's
// "Add a new habit" goes through the same guard and changes tab only after the sheet has gone.
const React = require('react');
const TestRenderer = require('react-test-renderer');
const { act } = TestRenderer;
const { Modal, TextInput } = require('react-native');

jest.mock('../../context/AppContext', () => {
  const { themes } = jest.requireActual('../../theme/colors');
  return {
    useApp: () => ({ theme: themes.light, themeName: 'light', todayStr: () => '2026-10-18' }),
    getChallengeTier: () => 'none',
    TIER_STYLES: {},
  };
});
jest.mock('../../context/AuthContext', () => ({ useAuth: () => ({ user: null }) }));
jest.mock('../../services/feedback', () => ({
  __esModule: true,
  default: { play: jest.fn(), toggled: jest.fn() },
  EVENTS: { refused: 'refused', selection: 'selection', destructiveConfirm: 'destructiveConfirm' },
}));
jest.mock('../../services/aiCoaching', () => ({ suggestHabit: jest.fn() }));
jest.mock('expo-image-picker', () => ({}));
jest.mock('@expo/vector-icons', () => ({ Ionicons: (props) => require('react').createElement('Ionicons', props) }));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('../../utils/a11y', () => ({
  ...jest.requireActual('../../utils/a11y'),
  isReducedMotion: () => false,
  useReducedMotion: () => false,
}));
const mockStub = (name) => (props) => require('react').createElement(name, props, props.children);
jest.mock('../../components/SafeAreaView', () => mockStub('SafeAreaView'));
jest.mock('../../components/Slider', () => mockStub('Slider'));
jest.mock('../../components/TimePicker', () => mockStub('TimePicker'));
jest.mock('../../components/HabitDetailSheet', () => mockStub('HabitDetailSheet'));

const { HabitModal } = require('../HabitsScreen');
const { ChallengeFormModal } = require('../ChallengeScreen');
const Dialog = require('../../components/ui/Dialog').default;
const { BLANK_FORM } = require('../../utils/habitForm');
const { t } = require('../../i18n');

global.IS_REACT_ACT_ENVIRONMENT = true;

beforeEach(() => jest.useFakeTimers());
afterEach(() => { act(() => { jest.runOnlyPendingTimers(); }); jest.useRealTimers(); });

const settle = () => { act(() => { jest.advanceTimersByTime(2000); }); act(() => { jest.runOnlyPendingTimers(); }); };
const sheetModal = (r) => r.root.findAll(n => n.type === Modal)[0];
// The Sheet's own discard Dialog is the last Dialog in the tree.
const discardDialog = (r) => { const all = r.root.findAllByType(Dialog); return all[all.length - 1]; };
const pressAction = (r, label) => {
  const action = discardDialog(r).props.actions.find(a => a.label === label);
  act(() => { action.onPress(); });
  settle();
};

function HabitHost({ onClose }) {
  const [form, setForm] = React.useState(BLANK_FORM);
  return React.createElement(HabitModal, {
    visible: true, editingId: null, form, setForm, onSave: jest.fn(), onClose, theme: require('../../theme/colors').themes.light,
  });
}

describe('habit form guard', () => {
  it('Android back on a clean form closes at once', () => {
    const onClose = jest.fn();
    let r;
    act(() => { r = TestRenderer.create(React.createElement(HabitHost, { onClose })); });
    settle();
    act(() => { sheetModal(r).props.onRequestClose(); });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(discardDialog(r).props.visible).toBe(false);
  });

  it('Android back after an edit asks first; Keep editing keeps it open', () => {
    const onClose = jest.fn();
    let r;
    act(() => { r = TestRenderer.create(React.createElement(HabitHost, { onClose })); });
    settle();
    const name = r.root.findAll(n => n.type === TextInput && n.props.placeholder === t('habits.form.namePlaceholder'))[0];
    act(() => { name.props.onChangeText('Walk'); });
    act(() => { sheetModal(r).props.onRequestClose(); });
    expect(onClose).not.toHaveBeenCalled();
    expect(discardDialog(r).props.visible).toBe(true);
    pressAction(r, t('common.discardChanges.keep'));
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe('challenge form "Add a new habit"', () => {
  const habits = [{ id: 'a', name: 'Read', icon: '📚' }];
  function ChallengeHost({ onAddHabit, onCloseSpy }) {
    const [visible, setVisible] = React.useState(true);
    return React.createElement(ChallengeFormModal, {
      visible, initial: null, habits, onSave: jest.fn(), onAddHabit,
      onClose: () => { onCloseSpy(); setVisible(false); },
      theme: require('../../theme/colors').themes.light,
    });
  }
  const mount = (props) => {
    let r;
    act(() => { r = TestRenderer.create(React.createElement(ChallengeHost, props)); });
    settle();
    return r;
  };
  const addNew = (r) => r.root.findAll(n => n.props.accessibilityLabel === t('challenges.form.addNewA11y') && typeof n.props.onPress === 'function')[0];
  const typeName = (r, text) => {
    const input = r.root.findAll(n => n.type === TextInput && n.props.placeholder === t('challenges.form.namePlaceholder'))[0];
    act(() => { input.props.onChangeText(text); });
  };

  it('clean: closes, then changes tab once the sheet has gone', () => {
    const onAddHabit = jest.fn(); const onCloseSpy = jest.fn();
    const r = mount({ onAddHabit, onCloseSpy });
    act(() => { addNew(r).props.onPress(); });
    expect(onCloseSpy).toHaveBeenCalledTimes(1);
    expect(onAddHabit).not.toHaveBeenCalled(); // not underneath the closing sheet
    settle();
    expect(onAddHabit).toHaveBeenCalledTimes(1);
  });

  it('dirty: asks; Keep editing drops the tab change, even on a later plain close', () => {
    const onAddHabit = jest.fn(); const onCloseSpy = jest.fn();
    const r = mount({ onAddHabit, onCloseSpy });
    typeName(r, 'My run');
    act(() => { addNew(r).props.onPress(); });
    expect(discardDialog(r).props.visible).toBe(true);
    expect(onCloseSpy).not.toHaveBeenCalled();
    pressAction(r, t('common.discardChanges.keep'));
    typeName(r, ''); // clean again
    act(() => { sheetModal(r).props.onRequestClose(); });
    expect(onCloseSpy).toHaveBeenCalledTimes(1);
    settle();
    expect(onAddHabit).not.toHaveBeenCalled();
  });

  it('dirty: Discard closes and then changes tab', () => {
    const onAddHabit = jest.fn(); const onCloseSpy = jest.fn();
    const r = mount({ onAddHabit, onCloseSpy });
    typeName(r, 'My run');
    act(() => { addNew(r).props.onPress(); });
    pressAction(r, t('common.discardChanges.discard'));
    act(() => { discardDialog(r).props.onDismiss?.(); }); // the Dialog has gone
    settle();
    expect(onCloseSpy).toHaveBeenCalledTimes(1);
    expect(onAddHabit).toHaveBeenCalledTimes(1);
  });
});

# UI kit (`@/components`)

Goal: every role's screens look like one calm, friendly app. Soft rose primary, deep maroon
headings/accents, warm cream background, white rounded cards, big touch targets, plain words.
Owner: head. Need a new shared component or a change? Build it locally inside your feature folder
first, and request promotion in your report.

```tsx
import { Button, Card, EmptyState, ErrorState, FormField, ListItem, LoadingState, Screen,
         SectionHeader, StatusChip, APPOINTMENT_STATUS_TONE, palette, spacing } from '@/components';
```

## Rules of thumb

- One `Screen` per route. Inside tab/stack layouts that already show a header, pass `edges={[]}`
  (or `['bottom']`), otherwise the default `['top','bottom']`.
- Content is a vertical stack of `Card`s and `SectionHeader`s; `Screen` already adds 16px padding
  and 16px gaps.
- Every query renders `LoadingState` -> `ErrorState onRetry={refetch}` -> `EmptyState` -> data.
- Colours only from `palette` / `toneColors`; spacing from `spacing`; radii from `radius`.
  Paper components already use the theme (`paperTheme`), so prefer Paper over raw RN widgets.
- One primary `Button` per screen. Destructive actions: `variant="danger"` + confirmation dialog
  (Paper `Dialog`).
- Text: Paper `Text` with variants (`headlineSmall`, `titleMedium`, `bodyMedium`, `labelMedium`).
  Never hard-code font sizes.
- Accessibility: tappable things are >= 48px high and have `accessibilityLabel`.

## Components

| Component | Props | Use for |
|---|---|---|
| `Screen` | `title?, subtitle?, scroll=true, refreshing?, onRefresh?, edges?, footer?, contentStyle?` | every page; `scroll={false}` when you render a `FlatList` |
| `Card` | `title?, subtitle?, right?, onPress?, variant='plain' \| 'soft'` | content blocks; `soft` = rose-tinted highlight (journey card, call-to-action) |
| `SectionHeader` | `title, actionLabel?, onAction?` | "Upcoming visits   See all" |
| `ListItem` | `title, description?, icon?, right?, onPress?` | rows in lists/cards; shows a chevron when tappable |
| `StatusChip` | `label, tone='neutral'` (`success \| warning \| danger \| info \| neutral \| primary`) | statuses, badges ("App", "Unverified", "High risk", "Doctor reviewed") |
| `APPOINTMENT_STATUS_TONE` | `Record<appt_status, Tone>` | `<StatusChip label={t('common:status.' + s)} tone={APPOINTMENT_STATUS_TONE[s]} />` |
| `InfoBanner` | `message, tone='info', icon?` | inline notices ("Bring a photo ID...") and form-level errors |
| `Button` | `label, variant='primary' \| 'secondary' \| 'text' \| 'danger', fullWidth?, loading?` + Paper props | all buttons |
| `FormField` | `control, name, label, hint?` + Paper `TextInput` props | text inputs bound to react-hook-form |
| `DateField` | `control, name, label, hint?, minimumDate?, maximumDate?` (ISO strings) | dates (value is `YYYY-MM-DD`) |
| `EmptyState` | `title, message?, icon?, actionLabel?, onAction?` | empty lists |
| `ErrorState` | `title?, message?, onRetry?` | failed queries (never show raw error text) |
| `LoadingState` | `message?` | first load |
| `HeaderActions` | - | bell + profile icons for role tab headers |
| `QueryBoundary` | `query` (TanStack query or `{ isPending?, isLoading?, isError, refetch, data? }`), `isEmpty?, empty?` (node or EmptyState props), `loadingMessage?`, children (node or `(data) => node`) | every data screen: error (retry) -> loading -> empty -> data. `combineQueries(...q)` merges several queries' loading/error/refetch |
| `ConfirmDialog` | `visible, title, message?, confirmLabel, cancelLabel?, danger?, loading?, errorKey?, confirmDisabled?, onConfirm, onDismiss`, children | destructive / patient-visible actions |
| `ChoiceChips` | `options, value, onChange, allowClear=true, scroll?, accessibilityLabel?` | single choice (filters, short selects); with `allowClear` tapping the selected chip sends `''` |
| `SlotPicker` | `days: { date, slots }[], selectedDay, onSelectDay, selectedSlot, onSelectSlot, timesHeader?` | free appointment slots (day row + time grid); the caller loads and groups the slots |

## Forms

```tsx
const schema = z.object({ title: z.string().min(2, { error: 'validation.required' }) });
const { control, handleSubmit, formState } = useForm({ resolver: zodResolver(schema), defaultValues: { title: '' } });

<FormField control={control} name="title" label={t('doctor:visit.title')} />
<Button label={t('common:actions.save')} loading={formState.isSubmitting}
        onPress={() => void handleSubmit(onSave)()} />
```

Zod error messages are **i18n keys** resolved in the `common` namespace (`validation.*`). Use
the existing keys (`required, email, otp, phone, date, pregnancyDate`); request new shared ones,
or use a namespaced key like `doctor:validation.bpRange` (FormField calls `t(message)`).

## RPC errors

```tsx
const { error } = await supabase.rpc('book_appointment', args);
if (error) setError(rpcErrorKey(error));          // from '@/domain/rpc-errors'
{error ? <InfoBanner tone="danger" message={t(error)} /> : null}
```

## Tests

`renderWithProviders` from `@/test-utils/render` wraps Paper theme, i18n and React Query.
RNTL v14 is async: `await renderWithProviders(...)`, `await fireEvent.press(...)`. Icons render
as their name in tests (see `jest.setup.js`).

export function sourcePresentation(source) {
  return {
    label: source.status === 'recovered' ? 'Direct access blocked — recovered through browser' : source.status,
    note: source.note || null,
  };
}

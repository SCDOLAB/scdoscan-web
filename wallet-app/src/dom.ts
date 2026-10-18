/** DOM helpers. Text and attributes only — no HTML parsing. */

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props?: { class?: string; text?: string; attrs?: Record<string, string> },
  ...kids: Array<Node | string | null | undefined>
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)
  if (props?.class) node.className = props.class
  if (props?.text) node.textContent = props.text
  if (props?.attrs) {
    for (const [key, value] of Object.entries(props.attrs)) node.setAttribute(key, value)
  }
  for (const kid of kids) {
    if (kid == null) continue
    node.append(typeof kid === 'string' ? document.createTextNode(kid) : kid)
  }
  return node
}

export function button(label: string, className: string, onClick: () => void): HTMLButtonElement {
  const node = el('button', { class: className, text: label, attrs: { type: 'button' } })
  node.addEventListener('click', onClick)
  return node
}

export function field(label: string, input: HTMLInputElement | HTMLSelectElement): HTMLLabelElement {
  const node = el('label', { class: 'field' })
  node.append(el('span', { text: label }), input)
  return node
}

export function input(opts: { type?: string; value?: string; placeholder?: string; autocomplete?: string }): HTMLInputElement {
  const node = el('input', {
    attrs: {
      type: opts.type || 'text',
      autocomplete: opts.autocomplete || 'off',
      autocapitalize: 'off',
      spellcheck: 'false',
    },
  })
  if (opts.value != null) node.value = opts.value
  if (opts.placeholder) node.placeholder = opts.placeholder
  return node
}

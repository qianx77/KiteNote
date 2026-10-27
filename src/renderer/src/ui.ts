/** 轻量弹窗工具（Electron 不支持 window.prompt） */

export function askText(
  title: string,
  initial = '',
  opts: { multiline?: boolean; suggestions?: string[]; placeholder?: string } = {}
): Promise<string | null> {
  return new Promise((resolve) => {
    const mask = document.createElement('div')
    mask.className = 'modal-mask'
    const box = document.createElement('div')
    box.className = 'modal'
    const h = document.createElement('div')
    h.className = 'modal-title'
    h.textContent = title
    const input = document.createElement(opts.multiline ? 'textarea' : 'input') as HTMLInputElement | HTMLTextAreaElement
    input.className = 'modal-input'
    input.value = initial
    if (opts.placeholder) input.placeholder = opts.placeholder
    if (opts.multiline) (input as HTMLTextAreaElement).rows = 8
    if (opts.suggestions?.length && !opts.multiline) {
      const id = `dl${Date.now()}`
      const dl = document.createElement('datalist')
      dl.id = id
      for (const s of opts.suggestions.slice(0, 500)) {
        const o = document.createElement('option')
        o.value = s
        dl.appendChild(o)
      }
      box.appendChild(dl)
      input.setAttribute('list', id)
    }
    const row = document.createElement('div')
    row.className = 'modal-actions'
    const ok = document.createElement('button')
    ok.className = 'btn primary'
    ok.textContent = '确定'
    const cancel = document.createElement('button')
    cancel.className = 'btn'
    cancel.textContent = '取消'
    row.append(cancel, ok)
    box.append(h, input, row)
    mask.appendChild(box)
    document.body.appendChild(mask)
    input.focus()
    if (!opts.multiline) (input as HTMLInputElement).select()
    const done = (v: string | null): void => {
      mask.remove()
      resolve(v)
    }
    ok.onclick = () => done(input.value)
    cancel.onclick = () => done(null)
    mask.onmousedown = (e) => {
      if (e.target === mask) done(null)
    }
    input.addEventListener('keydown', (e) => {
      const ke = e as KeyboardEvent
      if (ke.key === 'Escape') done(null)
      if (ke.key === 'Enter' && (!opts.multiline || ke.ctrlKey)) {
        e.preventDefault()
        done(input.value)
      }
    })
  })
}

export function confirmBox(message: string): Promise<boolean> {
  return new Promise((resolve) => {
    const mask = document.createElement('div')
    mask.className = 'modal-mask'
    mask.innerHTML = `<div class="modal"><div class="modal-title"></div><div class="modal-actions"><button class="btn">取消</button><button class="btn primary">确定</button></div></div>`
    mask.querySelector('.modal-title')!.textContent = message
    const [cancel, ok] = mask.querySelectorAll('button')
    const done = (v: boolean): void => {
      mask.remove()
      resolve(v)
    }
    ok.addEventListener('click', () => done(true))
    cancel.addEventListener('click', () => done(false))
    document.body.appendChild(mask)
    ;(ok as HTMLButtonElement).focus()
  })
}

export function toast(msg: string, ms = 2200): void {
  const el = document.createElement('div')
  el.className = 'toast'
  el.textContent = msg
  document.body.appendChild(el)
  setTimeout(() => el.classList.add('show'), 10)
  setTimeout(() => {
    el.classList.remove('show')
    setTimeout(() => el.remove(), 300)
  }, ms)
}

export interface MenuItem {
  label: string
  action?: () => void
  danger?: boolean
  separator?: boolean
}

export function showMenu(x: number, y: number, items: MenuItem[]): void {
  document.querySelectorAll('.ctx-menu').forEach((m) => m.remove())
  const menu = document.createElement('div')
  menu.className = 'ctx-menu'
  for (const it of items) {
    if (it.separator) {
      menu.appendChild(Object.assign(document.createElement('div'), { className: 'ctx-sep' }))
      continue
    }
    const b = document.createElement('div')
    b.className = 'ctx-item' + (it.danger ? ' danger' : '')
    b.textContent = it.label
    b.onclick = () => {
      menu.remove()
      it.action?.()
    }
    menu.appendChild(b)
  }
  document.body.appendChild(menu)
  const r = menu.getBoundingClientRect()
  menu.style.left = `${Math.min(x, window.innerWidth - r.width - 8)}px`
  menu.style.top = `${Math.min(y, window.innerHeight - r.height - 8)}px`
  setTimeout(() => document.addEventListener('mousedown', function off(e) {
    if (!menu.contains(e.target as Node)) {
      menu.remove()
      document.removeEventListener('mousedown', off)
    }
  }), 0)
}

/**
 * 原图查看器：以原始尺寸显示（超出窗口时先缩放到适合窗口），
 * 滚轮缩放、拖动平移、双击在「适合窗口 / 100%」间切换，Esc 或点空白处关闭。
 */
export function showImageViewer(src: string, title = ''): void {
  const mask = document.createElement('div')
  mask.className = 'img-viewer'
  const img = document.createElement('img')
  img.src = src
  img.draggable = false
  const bar = document.createElement('div')
  bar.className = 'img-viewer-bar'
  mask.append(img, bar)
  document.body.appendChild(mask)

  let scale = 1
  let fit = 1
  let x = 0
  let y = 0
  const apply = (): void => {
    img.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%) scale(${scale})`
    const size = img.naturalWidth ? `${img.naturalWidth} × ${img.naturalHeight}　` : ''
    bar.textContent = `${title ? title + '　' : ''}${size}${Math.round(scale * 100)}%　滚轮缩放 · 拖动平移 · 双击切换 100% · Esc 关闭`
  }
  const reset = (): void => {
    x = y = 0
    scale = fit
    apply()
  }
  img.onload = () => {
    fit = Math.min(1, (window.innerWidth - 80) / img.naturalWidth, (window.innerHeight - 100) / img.naturalHeight)
    reset()
  }
  apply()

  const close = (): void => {
    mask.remove()
    document.removeEventListener('keydown', onKey, true)
  }
  const onKey = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      close()
    }
  }
  document.addEventListener('keydown', onKey, true)

  mask.addEventListener('wheel', (e) => {
    e.preventDefault()
    const next = Math.min(20, Math.max(0.05, scale * (e.deltaY < 0 ? 1.15 : 1 / 1.15)))
    // 以鼠标位置为中心缩放
    const cx = e.clientX - window.innerWidth / 2 - x
    const cy = e.clientY - window.innerHeight / 2 - y
    x -= cx * (next / scale - 1)
    y -= cy * (next / scale - 1)
    scale = next
    apply()
  }, { passive: false })

  let drag: { sx: number; sy: number; x: number; y: number; moved: boolean } | null = null
  mask.addEventListener('mousedown', (e) => {
    if (e.button !== 0 || e.target === bar) return
    drag = { sx: e.clientX, sy: e.clientY, x, y, moved: false }
  })
  mask.addEventListener('mousemove', (e) => {
    if (!drag) return
    const dx = e.clientX - drag.sx
    const dy = e.clientY - drag.sy
    if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true
    x = drag.x + dx
    y = drag.y + dy
    if (drag.moved) apply()
  })
  mask.addEventListener('mouseup', (e) => {
    // 只认在查看器里按下的点击：打开查看器的那次双击，其松开鼠标不能算作「点空白处关闭」
    const clicked = drag !== null && !drag.moved
    drag = null
    if (clicked && e.target === mask) close()
  })
  img.addEventListener('dblclick', () => {
    if (Math.abs(scale - 1) < 0.01 && fit < 1) reset()
    else {
      x = y = 0
      scale = 1
      apply()
    }
  })
}

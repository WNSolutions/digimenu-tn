// @ts-check
/**
 * Draws what modules describe (extensions.js `Block`): sheet pages and post-order blocks.
 * The core owns the look; a module only says "a title", "stamps 3 of 10", "a code", "a form".
 * Text goes in with textContent, never as HTML. A block that fails is skipped.
 */
import { h, icon, bdi } from './dom.js';
import { openSheet } from './sheet.js';

/** @typedef {import('./context.js').Ctx} Ctx */
/** @typedef {import('./extensions.js').Block} Block */

const MAX_STAMPS = 50;

/**
 * @param {Ctx} ctx
 * @param {Block[]} blocks
 * @param {{ key: string, replace: (blocks: Block[]) => void }} o
 *   `replace` draws the blocks a form or button returns in place of these
 * @returns {Node[]}
 */
export function renderBlocks(ctx, blocks, o) {
  /** @type {Node[]} */
  const out = [];
  for (const block of blocks) {
    try {
      const node = renderBlock(ctx, block, o);
      if (node) out.push(node);
    } catch (err) {
      ctx.ext.report(`module ${o.key}: a block failed`, err);
    }
  }
  return out;
}

/**
 * @param {Ctx} ctx
 * @param {Block} b
 * @param {{ key: string, replace: (blocks: Block[]) => void }} o
 * @returns {Node | null}
 */
function renderBlock(ctx, b, o) {
  const text = (/** @type {unknown} */ v) => (typeof v === 'string' ? v : '');
  switch (b?.kind) {
    case 'title':
      return h('h3', { class: 'dm-block-title' }, text(b.text));
    case 'text':
      return h(
        'p',
        {
          class: `dm-block-text${b.tone ? ` dm-block-text--${b.tone}` : ''}`,
          ...(b.tone === 'error' ? { role: 'alert' } : {}),
        },
        text(b.text),
      );
    case 'stamps': {
      const total = Math.max(1, Math.min(MAX_STAMPS, Math.floor(Number(b.total) || 0)));
      const filled = Math.max(0, Math.min(total, Math.floor(Number(b.filled) || 0)));
      return h(
        'div',
        { class: 'dm-stamps', role: 'img', 'aria-label': text(b.label) },
        ...Array.from({ length: total }, (_, i) =>
          h(
            'span',
            { class: `dm-stamp${i < filled ? ' is-on' : ''}`, 'aria-hidden': 'true' },
            i < filled ? icon('check', 'dm-icon--sm') : null,
          ),
        ),
      );
    }
    case 'code':
      return h(
        'div',
        { class: 'dm-codebox' },
        h('span', { class: 'dm-codebox-label' }, text(b.label)),
        bdi(
          text(b.value)
            .replace(/(.{3})(?=.)/g, '$1 ')
            .trim(),
          'dm-codebox-value',
        ),
      );
    case 'page':
      return h(
        'button',
        {
          type: 'button',
          class: 'dm-plain dm-plain--center',
          onclick: () => {
            const page = ctx.ext.page(`${o.key}:${b.page}`);
            if (page) openModulePage(ctx, page);
          },
        },
        text(b.label),
      );
    case 'button': {
      let armed = false;
      const button = h(
        'button',
        {
          type: 'button',
          class:
            b.look === 'prominent'
              ? 'dm-prominent'
              : b.look === 'danger'
                ? 'dm-plain dm-plain--center dm-plain--danger'
                : 'dm-plain dm-plain--center',
          onclick: async () => {
            // A question first, on the button itself (no browser dialog).
            if (b.confirm && !armed) {
              armed = true;
              button.textContent = text(b.confirm);
              return;
            }
            button.disabled = true;
            const next = await safeRun(ctx, o.key, () => b.run());
            if (next) o.replace(next);
            else button.disabled = false;
          },
        },
        text(b.label),
      );
      return button;
    }
    case 'form': {
      const inputs = (Array.isArray(b.fields) ? b.fields : []).map((f) => {
        const id = `m-${o.key}-${f.id}`;
        const input = h('input', {
          class: 'dm-input',
          id,
          name: f.id,
          inputmode: f.inputmode ?? 'text',
          maxlength: Math.min(64, Number(f.maxlength) || 64),
          autocomplete: 'off',
          autocapitalize: 'characters',
          spellcheck: 'false',
          ...(f.ltr ? { dir: 'ltr' } : {}),
          ...(f.placeholder ? { placeholder: text(f.placeholder) } : {}),
        });
        return {
          id: f.id,
          input,
          node: h(
            'div',
            { class: 'dm-field' },
            h('label', { class: 'dm-field-label', for: id }, text(f.label)),
            input,
          ),
        };
      });
      const submit = h('button', { type: 'submit', class: 'dm-prominent' }, text(b.submit));
      return h(
        'form',
        {
          class: 'dm-block-form',
          onsubmit: async (/** @type {Event} */ e) => {
            e.preventDefault();
            if (submit.disabled) return;
            submit.disabled = true;
            const values = Object.fromEntries(inputs.map((i) => [i.id, i.input.value.trim()]));
            const next = await safeRun(ctx, o.key, () => b.run(values));
            submit.disabled = false;
            if (next) o.replace(next);
          },
        },
        ...inputs.map((i) => i.node),
        submit,
      );
    }
    default:
      return null;
  }
}

/**
 * @template T
 * @param {Ctx} ctx
 * @param {string} key
 * @param {() => Promise<T>} run
 * @returns {Promise<T | null>}
 */
async function safeRun(ctx, key, run) {
  try {
    return await run();
  } catch (err) {
    ctx.ext.report(`module ${key}: an action failed`, err);
    return null;
  }
}

/**
 * Opens a module's sheet page: a loading line, then what the module's `view` returns.
 * @param {Ctx} ctx
 * @param {import('./extensions.js').SheetPage & { key: string }} page
 */
export function openModulePage(ctx, page) {
  const { t } = ctx;
  const content = h(
    'div',
    { class: 'dm-module-page' },
    h('p', { class: 'dm-block-text dm-block-text--muted' }, t('module.loading')),
  );
  let title;
  try {
    title = page.title(ctx.lang);
  } catch {
    title = '';
  }
  const sheet = openSheet({
    title,
    content,
    size: 'large',
    closeLabel: t('sheet.close'),
    grabberLabels: [t('sheet.expand'), t('sheet.collapse')],
    lang: ctx.lang,
    dir: ctx.dir,
  });
  /** @param {Block[]} blocks */
  const draw = (blocks) =>
    content.replaceChildren(...renderBlocks(ctx, blocks, { key: page.key, replace: draw }));
  safeRun(ctx, page.key, () => page.view({ lang: ctx.lang })).then((blocks) => {
    draw(blocks ?? [{ kind: 'text', text: t('module.error'), tone: 'error' }]);
  });
  return sheet;
}

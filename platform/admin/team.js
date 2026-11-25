// @ts-check
/**
 * Accounts in the staff app (issue #18, ADR-0006, D-026):
 *
 *   - "Équipe" (Manager, Admin): who works at the café, new accounts, a new one-time code when
 *     someone forgets their password, disable / enable, and the role (Admin only).
 *   - "Mon compte" (everyone): where the account is signed in, signing out a device, changing
 *     the own password, signing out.
 *
 * The server checks every action (platform/shell/src/team-api.js and auth.js); hiding a button
 * here is a convenience, not the rule. Nobody ever sees a password: new accounts and resets get
 * a one-time code, shown once, that the person uses in "Première connexion".
 */

/** @type {Record<'fr' | 'ar', Record<string, string>>} */
export const TEAM_TEXT = {
  fr: {
    tab: 'Équipe',
    account: 'Mon compte',
    intro:
      'Les comptes de ce café. Chaque personne a son propre compte : ne partagez pas un mot de passe.',
    add: 'Ajouter une personne',
    name: 'Nom affiché',
    username: 'Identifiant (minuscules, sans espace)',
    role: 'Rôle',
    create: 'Créer le compte',
    r_staff: 'Équipe (serveur, comptoir)',
    r_manager: 'Responsable',
    r_maintainer: 'Maintenance (formé·e DigiMenu)',
    s_active: 'Actif',
    s_disabled: 'Désactivé',
    s_code: 'Code en attente jusqu’au {d}',
    s_noPassword: 'Pas encore de mot de passe',
    lastSeen: 'Vu le {d}',
    never: 'Jamais connecté',
    reset: 'Nouveau code',
    disable: 'Désactiver',
    enable: 'Réactiver',
    resetAsk:
      '{n} ne pourra plus se connecter avec son mot de passe actuel, et sera déconnecté de tous ses appareils. Continuer ?',
    disableAsk:
      '{n} sera déconnecté de tous ses appareils et ne pourra plus se connecter. Continuer ?',
    codeTitle: 'Code pour {n}',
    codeHelp:
      'Donnez ce code à {n} en main propre (jamais par message public). Il sert une seule fois, jusqu’au {d}. {n} ouvre l’espace équipe, choisit « Première connexion », tape l’identifiant « {u} » et ce code, puis choisit son mot de passe.',
    codeOnce: 'Ce code ne sera plus affiché.',
    done: 'C’est noté',
    taken: 'Cet identifiant est déjà pris (dans ce café ou un autre).',
    badInput:
      'Vérifiez le nom et l’identifiant : 3 à 40 caractères, lettres minuscules, chiffres, . _ -',
    forbidden: 'Votre rôle ne permet pas cette action.',
    error: 'Une erreur est survenue. Réessayez.',
    you: '(vous)',
    devices: 'Mes appareils',
    devicesIntro:
      'Les appareils où votre compte est connecté. Si vous ne reconnaissez pas un appareil, déconnectez-le et changez votre mot de passe.',
    thisDevice: 'Cet appareil',
    unknownDevice: 'Appareil inconnu',
    since: 'connecté le {d}',
    seen: 'dernière activité le {d}',
    signOutDevice: 'Déconnecter',
    signOutOthers: 'Déconnecter tous les autres appareils',
    noOthers: 'Aucun autre appareil connecté.',
    password: 'Changer mon mot de passe',
    current: 'Mot de passe actuel',
    newPassword: 'Nouveau mot de passe (10 caractères minimum)',
    confirm: 'Confirmer le nouveau mot de passe',
    change: 'Changer le mot de passe',
    working: 'Vérification…',
    changed: 'Mot de passe changé. Vos autres appareils devront se reconnecter.',
    wrong: 'Le mot de passe actuel est incorrect.',
    short: 'Le nouveau mot de passe doit faire au moins 10 caractères.',
    mismatch: 'Les deux nouveaux mots de passe ne correspondent pas.',
    signOut: 'Se déconnecter',
    who: '{n} · identifiant « {u} »',
    r_admin: 'Admin',
  },
  ar: {
    tab: 'الفريق',
    account: 'حسابي',
    intro: 'حسابات هذا المقهى. لكل شخص حسابه الخاص: لا تتشاركوا كلمة سرّ.',
    add: 'إضافة شخص',
    name: 'الاسم المعروض',
    username: 'المعرّف (حروف لاتينية صغيرة، بدون فراغ)',
    role: 'الدور',
    create: 'إنشاء الحساب',
    r_staff: 'الفريق (نادل، كونتوار)',
    r_manager: 'مسؤول',
    r_maintainer: 'صيانة (متكوّن على DigiMenu)',
    s_active: 'نشط',
    s_disabled: 'معطّل',
    s_code: 'رمز في الانتظار حتى {d}',
    s_noPassword: 'لا كلمة سرّ بعد',
    lastSeen: 'آخر ظهور {d}',
    never: 'لم يتّصل بعد',
    reset: 'رمز جديد',
    disable: 'تعطيل',
    enable: 'إعادة التفعيل',
    resetAsk: 'لن يتمكّن {n} من الدخول بكلمة سرّه الحالية، وسيُفصل من كل أجهزته. هل تواصل؟',
    disableAsk: 'سيُفصل {n} من كل أجهزته ولن يتمكّن من الدخول. هل تواصل؟',
    codeTitle: 'رمز {n}',
    codeHelp:
      'سلّم هذا الرمز إلى {n} يدًا بيد (لا في رسالة عامة). يُستعمل مرة واحدة حتى {d}. يفتح {n} فضاء الفريق، ويختار «أول دخول»، ويكتب المعرّف «{u}» وهذا الرمز، ثم يختار كلمة سرّه.',
    codeOnce: 'لن يظهر هذا الرمز مرة أخرى.',
    done: 'تمّ',
    taken: 'هذا المعرّف مستعمل (في هذا المقهى أو في غيره).',
    badInput: 'تحقّق من الاسم والمعرّف: من 3 إلى 40 حرفًا، حروف لاتينية صغيرة، أرقام، . _ -',
    forbidden: 'دورك لا يسمح بهذا الإجراء.',
    error: 'حدث خطأ. أعد المحاولة.',
    you: '(أنت)',
    devices: 'أجهزتي',
    devicesIntro: 'الأجهزة المتّصلة بحسابك. إن لم تتعرّف على جهاز، افصله وغيّر كلمة سرّك.',
    thisDevice: 'هذا الجهاز',
    unknownDevice: 'جهاز غير معروف',
    since: 'متّصل منذ {d}',
    seen: 'آخر نشاط {d}',
    signOutDevice: 'فصل',
    signOutOthers: 'فصل كل الأجهزة الأخرى',
    noOthers: 'لا جهاز آخر متّصل.',
    password: 'تغيير كلمة سرّي',
    current: 'كلمة السرّ الحالية',
    newPassword: 'كلمة السرّ الجديدة (10 أحرف على الأقل)',
    confirm: 'تأكيد كلمة السرّ الجديدة',
    change: 'تغيير كلمة السرّ',
    working: 'جارٍ التحقّق…',
    changed: 'تمّ تغيير كلمة السرّ. ستحتاج أجهزتك الأخرى إلى الدخول من جديد.',
    wrong: 'كلمة السرّ الحالية غير صحيحة.',
    short: 'يجب أن تحتوي كلمة السرّ الجديدة على 10 أحرف على الأقل.',
    mismatch: 'كلمتا السرّ الجديدتان غير متطابقتين.',
    signOut: 'الخروج',
    who: '{n} · المعرّف «{u}»',
    r_admin: 'الإدارة',
  },
};

/**
 * @typedef {object} TeamDeps
 * @property {(tag: string, attrs?: Record<string, any> | null, ...children: any[]) => HTMLElement} h
 * @property {'fr' | 'ar'} lang
 * @property {(path: string, body?: any) => Promise<{ status: number, data: any }>} api
 * @property {string} cafe          the café shown
 * @property {string} role          the signed-in role in that café
 * @property {{ id: string, username: string, displayName: string }} me
 * @property {(password: string, salt: string, iterations: number) => Promise<string>} stretch
 * @property {() => void} signedOut
 */

/** @param {'fr' | 'ar'} lang */
function texts(lang) {
  return (/** @type {string} */ key, /** @type {Record<string, string>} */ vars = {}) =>
    (TEAM_TEXT[lang][key] ?? TEAM_TEXT.fr[key] ?? key).replace(/\{(\w+)\}/g, (_, k) =>
      String(vars[k] ?? ''),
    );
}

/** @param {'fr' | 'ar'} lang @param {string} iso */
function when(lang, iso) {
  return new Date(iso).toLocaleString(lang === 'ar' ? 'ar-TN' : 'fr-TN', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    numberingSystem: 'latn',
  });
}

/**
 * "Équipe": the café's accounts.
 * @param {HTMLElement} body
 * @param {TeamDeps} d
 */
export function teamView(body, d) {
  const { h, lang } = d;
  const t = texts(lang);
  const admin = d.role === 'admin';
  const message = h('p', { class: 'a-muted', role: 'status', hidden: true });
  const list = h('div', { class: 'a-stack' });
  /** @param {string} text @param {'ok' | 'error'} [tone] */
  const say = (text, tone = 'error') => {
    message.className = tone === 'ok' ? 'a-ok' : 'a-error';
    message.textContent = text;
    message.hidden = !text;
  };
  /** @param {{ status: number, data: any }} res */
  const failed = (res) => {
    if (res.status === 401) return d.signedOut();
    say(
      res.status === 409 && res.data?.error === 'username_taken'
        ? t('taken')
        : res.status === 400
          ? t('badInput')
          : res.status === 403
            ? t('forbidden')
            : t('error'),
    );
  };

  /** The one-time code, shown once, with what to do with it. */
  const codeBox = (
    /** @type {string} */ name,
    /** @type {string} */ username,
    /** @type {any} */ data,
  ) => {
    const box = h(
      'section',
      { class: 'a-card a-stack a-codebox', role: 'alert' },
      h('h2', { class: 'a-title' }, t('codeTitle', { n: name })),
      h('p', { class: 'a-code', dir: 'ltr' }, data.code),
      h('p', null, t('codeHelp', { n: name, u: username, d: when(lang, data.expiresAt) })),
      h('p', { class: 'a-muted' }, t('codeOnce')),
      h(
        'button',
        { type: 'button', class: 'a-btn a-btn--main', onclick: () => box.remove() },
        t('done'),
      ),
    );
    body.insertBefore(box, list);
    box.scrollIntoView({ block: 'start' });
  };

  /** @param {any} m */
  const row = (m) => {
    const self = m.id === d.me.id;
    const status = m.disabled
      ? t('s_disabled')
      : m.codeUntil
        ? t('s_code', { d: when(lang, m.codeUntil) })
        : m.hasPassword
          ? t('s_active')
          : t('s_noPassword');
    const canManage = !self && (admin || m.role === 'staff');
    /** @param {string} route @param {any} extra @param {string} [ask] */
    const act = async (route, extra = {}, ask) => {
      if (ask && !confirm(ask)) return;
      const res = await d.api(`/team/${route}`, { cafe: d.cafe, userId: m.id, ...extra });
      if (res.status !== 200) return failed(res);
      if (route === 'reset') codeBox(m.name, m.username, res.data);
      await load();
    };
    const roleSelect =
      admin && !self
        ? /** @type {HTMLSelectElement} */ (
            h(
              'select',
              {
                class: 'a-input',
                'aria-label': t('role'),
                onchange: (/** @type {Event} */ e) =>
                  act('role', { role: /** @type {HTMLSelectElement} */ (e.target).value }),
              },
              ...['staff', 'manager', 'maintainer'].map((r) =>
                h('option', { value: r, selected: r === m.role }, t(`r_${r}`)),
              ),
            )
          )
        : h('span', { class: 'a-badge' }, t(`r_${m.role}`));
    return h(
      'article',
      { class: `a-card a-stack a-member${m.disabled ? ' a-member--off' : ''}` },
      h(
        'div',
        { class: 'a-row a-spread' },
        h(
          'div',
          null,
          h('strong', null, m.name, self ? ` ${t('you')}` : ''),
          h('p', { class: 'a-muted', dir: 'ltr' }, m.username),
        ),
        roleSelect,
      ),
      h(
        'p',
        { class: 'a-muted' },
        status,
        ' · ',
        m.lastSeen ? t('lastSeen', { d: when(lang, m.lastSeen) }) : t('never'),
      ),
      canManage
        ? h(
            'div',
            { class: 'a-row' },
            m.disabled
              ? null
              : h(
                  'button',
                  {
                    type: 'button',
                    class: 'a-btn',
                    onclick: () =>
                      act('reset', {}, m.hasPassword ? t('resetAsk', { n: m.name }) : ''),
                  },
                  t('reset'),
                ),
            h(
              'button',
              {
                type: 'button',
                class: m.disabled ? 'a-btn' : 'a-btn a-btn--danger',
                onclick: () =>
                  m.disabled ? act('enable') : act('disable', {}, t('disableAsk', { n: m.name })),
              },
              m.disabled ? t('enable') : t('disable'),
            ),
          )
        : null,
    );
  };

  async function load() {
    const res = await d.api(`/team?cafe=${encodeURIComponent(d.cafe)}`);
    if (res.status !== 200) return failed(res);
    list.replaceChildren(...res.data.team.map(row));
  }

  // Adding a person: Manager adds Staff; Admin chooses the role.
  const name = h('input', { class: 'a-input', id: 'tm-name', maxlength: 60, required: true });
  const username = h('input', {
    class: 'a-input',
    id: 'tm-user',
    dir: 'ltr',
    autocapitalize: 'none',
    autocomplete: 'off',
    spellcheck: 'false',
    pattern: '[a-z0-9._\\-]{3,40}',
    required: true,
  });
  const role = admin
    ? h(
        'select',
        { class: 'a-input', id: 'tm-role' },
        ...['staff', 'manager', 'maintainer'].map((r) => h('option', { value: r }, t(`r_${r}`))),
      )
    : null;
  const addForm = h(
    'form',
    { class: 'a-card a-stack' },
    h('h2', { class: 'a-title' }, t('add')),
    h('label', { class: 'a-label', for: 'tm-name' }, t('name'), name),
    h('label', { class: 'a-label', for: 'tm-user' }, t('username'), username),
    role ? h('label', { class: 'a-label', for: 'tm-role' }, t('role'), role) : null,
    h('button', { type: 'submit', class: 'a-btn a-btn--main' }, t('create')),
  );
  addForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const n = /** @type {HTMLInputElement} */ (name).value.trim();
    const u = /** @type {HTMLInputElement} */ (username).value.trim().toLowerCase();
    const res = await d.api('/team/create', {
      cafe: d.cafe,
      name: n,
      username: u,
      role: role ? /** @type {HTMLSelectElement} */ (role).value : 'staff',
    });
    if (res.status !== 201) return failed(res);
    /** @type {HTMLFormElement} */ (addForm).reset();
    say('');
    codeBox(n, u, res.data);
    await load();
  });

  body.replaceChildren(
    h('h1', { class: 'a-title' }, t('tab')),
    h('p', { class: 'a-muted' }, t('intro')),
    message,
    list,
    addForm,
  );
  load();
}

/**
 * "Mon compte": devices, own password, sign out. Every role has it.
 * @param {HTMLElement} body
 * @param {TeamDeps} d
 */
export function accountView(body, d) {
  const { h, lang } = d;
  const t = texts(lang);
  const devices = h('div', { class: 'a-stack' });
  const deviceMsg = h('p', { class: 'a-muted', role: 'status', hidden: true });

  /** @param {any[]} sessions */
  const showDevices = (sessions) => {
    const others = sessions.filter((s) => !s.current);
    devices.replaceChildren(
      ...sessions.map((s) =>
        h(
          'div',
          { class: 'a-row a-spread a-device' },
          h(
            'div',
            null,
            h('strong', null, s.device || t('unknownDevice')),
            s.current ? h('span', { class: 'a-badge' }, t('thisDevice')) : null,
            h(
              'p',
              { class: 'a-muted' },
              t('since', { d: when(lang, s.since) }),
              ' · ',
              t('seen', { d: when(lang, s.lastSeen) }),
            ),
          ),
          s.current
            ? null
            : h(
                'button',
                { type: 'button', class: 'a-btn', onclick: () => revoke({ id: s.id }) },
                t('signOutDevice'),
              ),
        ),
      ),
      others.length
        ? h(
            'button',
            { type: 'button', class: 'a-btn a-btn--danger', onclick: () => revoke({ all: true }) },
            t('signOutOthers'),
          )
        : h('p', { class: 'a-muted' }, t('noOthers')),
    );
  };
  /** @param {any} what */
  const revoke = async (what) => {
    const res = await d.api('/auth/sessions/revoke', what);
    if (res.status === 401) return d.signedOut();
    if (res.status !== 200) {
      deviceMsg.className = 'a-error';
      deviceMsg.textContent = t('error');
      deviceMsg.hidden = false;
      return;
    }
    showDevices(res.data.sessions);
  };

  const current = h('input', {
    class: 'a-input',
    id: 'ac-cur',
    type: 'password',
    autocomplete: 'current-password',
    required: true,
  });
  const next = h('input', {
    class: 'a-input',
    id: 'ac-new',
    type: 'password',
    autocomplete: 'new-password',
    minlength: 10,
    required: true,
  });
  const next2 = h('input', {
    class: 'a-input',
    id: 'ac-new2',
    type: 'password',
    autocomplete: 'new-password',
    minlength: 10,
    required: true,
  });
  const pwMsg = h('p', { class: 'a-muted', role: 'status', hidden: true });
  const pwButton = /** @type {HTMLButtonElement} */ (
    h('button', { type: 'submit', class: 'a-btn a-btn--main' }, t('change'))
  );
  const pwForm = h(
    'form',
    { class: 'a-card a-stack' },
    h('h2', { class: 'a-title' }, t('password')),
    // Lets the browser's password manager match the account.
    h('input', {
      type: 'text',
      autocomplete: 'username',
      value: d.me.username,
      hidden: true,
      readonly: true,
    }),
    h('label', { class: 'a-label', for: 'ac-cur' }, t('current'), current),
    h('label', { class: 'a-label', for: 'ac-new' }, t('newPassword'), next),
    h('label', { class: 'a-label', for: 'ac-new2' }, t('confirm'), next2),
    pwMsg,
    pwButton,
  );
  /** @param {string} key @param {'ok' | 'error'} tone */
  const pwSay = (key, tone) => {
    pwMsg.className = tone === 'ok' ? 'a-ok' : 'a-error';
    pwMsg.textContent = t(key);
    pwMsg.hidden = false;
  };
  pwForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const p1 = /** @type {HTMLInputElement} */ (next).value;
    if (p1.length < 10) return pwSay('short', 'error');
    if (p1 !== /** @type {HTMLInputElement} */ (next2).value) return pwSay('mismatch', 'error');
    pwButton.disabled = true;
    pwButton.textContent = t('working');
    try {
      const old = await d.api('/auth/salt', { username: d.me.username });
      const currentKey = await d.stretch(
        /** @type {HTMLInputElement} */ (current).value,
        old.data.salt,
        old.data.iterations,
      );
      const salt = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(16))));
      const iterations = 600_000;
      const key = await d.stretch(p1, salt, iterations);
      const res = await d.api('/auth/change-password', { currentKey, salt, iterations, key });
      if (res.status === 200) {
        /** @type {HTMLFormElement} */ (pwForm).reset();
        pwSay('changed', 'ok');
        const list = await d.api('/auth/sessions');
        if (list.status === 200) showDevices(list.data.sessions);
      } else if (res.status === 401 && res.data?.error === 'wrong_credentials') {
        pwSay('wrong', 'error');
      } else if (res.status === 401) {
        d.signedOut();
      } else {
        pwSay('error', 'error');
      }
    } catch {
      pwSay('error', 'error');
    }
    pwButton.disabled = false;
    pwButton.textContent = t('change');
  });

  body.replaceChildren(
    h('h1', { class: 'a-title' }, t('account')),
    h('p', { class: 'a-muted' }, t('who', { n: d.me.displayName, u: d.me.username })),
    h(
      'section',
      { class: 'a-card a-stack' },
      h('h2', { class: 'a-title' }, t('devices')),
      h('p', { class: 'a-muted' }, t('devicesIntro')),
      deviceMsg,
      devices,
    ),
    pwForm,
    h(
      'button',
      {
        type: 'button',
        class: 'a-btn',
        onclick: async () => {
          await d.api('/auth/sign-out', {});
          d.signedOut();
        },
      },
      t('signOut'),
    ),
  );
  d.api('/auth/sessions').then((res) => {
    if (res.status === 401) return d.signedOut();
    if (res.status === 200) showDevices(res.data.sessions);
  });
}

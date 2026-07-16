// ============================================================
//  ПРОБУЖДЕНИЕ! — landing interactions
// ============================================================

// ----- Intro splash configuration -------------------------------------------
// The designer may still change these; each is a single switch.
const INTRO = {
  /** 'always' = every load · 'session' = once per tab session · 'device' = once ever */
  replay: 'session' as 'always' | 'session' | 'device',
  /** true → show the "enter" gate (a click is required for audio to play)
   *  false → autoplay muted with no gate */
  sound: false,
  /** skip button + click/tap on the video ends the intro early */
  skippable: true,
  /** viewport width (px) at/below which the mobile video is used */
  mobileMaxWidth: 768,
  desktopSrc: 'assets/intro-desktop.mp4',
  mobileSrc: 'assets/intro-mobile.mp4',
  storageKey: 'intro-seen',
} as const;

function introAlreadySeen(): boolean {
  if (INTRO.replay === 'always') return false;
  try {
    const store = INTRO.replay === 'session' ? sessionStorage : localStorage;
    return store.getItem(INTRO.storageKey) === '1';
  } catch {
    return false;
  }
}

function markIntroSeen(): void {
  if (INTRO.replay === 'always') return;
  try {
    const store = INTRO.replay === 'session' ? sessionStorage : localStorage;
    store.setItem(INTRO.storageKey, '1');
  } catch {
    /* storage unavailable (private mode) — just skip persisting */
  }
}

/** Splash intro: optional "enter" gate → fullscreen video → fade to black → site. */
function initIntro(): void {
  const intro = document.querySelector<HTMLElement>('#intro');
  if (!intro) return;

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reducedMotion || introAlreadySeen()) {
    intro.remove();
    return;
  }

  const video = intro.querySelector<HTMLVideoElement>('#intro-video');
  const enterBtn = intro.querySelector<HTMLButtonElement>('#intro-enter');
  const skipBtn = intro.querySelector<HTMLButtonElement>('#intro-skip');
  if (!video || !enterBtn || !skipBtn) {
    intro.remove();
    return;
  }

  const isMobile = window.matchMedia(`(max-width: ${INTRO.mobileMaxWidth}px)`).matches;
  video.src = isMobile ? INTRO.mobileSrc : INTRO.desktopSrc;
  video.muted = !INTRO.sound;

  intro.classList.add('is-active');
  intro.setAttribute('aria-hidden', 'false');
  document.body.classList.add('intro-lock');

  let ending = false;
  const end = (): void => {
    if (ending) return;
    ending = true;
    intro.classList.add('is-ending'); // video → black
    window.setTimeout(() => intro.classList.add('is-hiding'), 500); // black → site
    window.setTimeout(() => {
      intro.remove();
      document.body.classList.remove('intro-lock');
      markIntroSeen();
    }, 1200);
    try {
      video.pause();
    } catch {
      /* ignore */
    }
  };

  const start = (): void => {
    intro.classList.add('is-playing');
    if (INTRO.skippable) skipBtn.hidden = false;
    void video.play().catch(end); // if playback is blocked, fall through to the site
  };

  if (INTRO.sound) {
    enterBtn.addEventListener('click', start);
  } else {
    enterBtn.hidden = true;
    start();
  }

  video.addEventListener('ended', end);
  if (INTRO.skippable) {
    skipBtn.addEventListener('click', end);
    video.addEventListener('click', end);
  }
}

/** Tile the marquee image enough times to cover the viewport, and drive the
 * CSS loop by exactly one tile's width (--marquee-tile-w) — a fixed 2 copies
 * / -50% only stays seamless on screens narrower than one tile (~1272px);
 * anything wider opens a gap once the track scrolls past the first tile. */
function initMarquee(): void {
  const track = document.querySelector<HTMLElement>('.marquee__track');
  const tile = track?.querySelector<HTMLImageElement>('.marquee__img');
  if (!track || !tile) return;

  const layout = (): void => {
    const tileWidth = tile.getBoundingClientRect().width;
    const viewportWidth = track.parentElement?.clientWidth ?? 0;
    if (!tileWidth || !viewportWidth) return;
    track.style.setProperty('--marquee-tile-w', `${tileWidth}px`);
    const needed = Math.ceil(viewportWidth / tileWidth) + 2;
    while (track.children.length < needed) {
      const clone = tile.cloneNode(true) as HTMLImageElement;
      clone.alt = '';
      clone.setAttribute('aria-hidden', 'true');
      track.appendChild(clone);
    }
  };

  if (tile.complete) layout();
  else tile.addEventListener('load', layout, { once: true });
  window.addEventListener('resize', layout);
}

/** Expandable past-event cards: clicking a card stretches that card out into
 * its event's wide gallery card, overlaying the grid (the grid stays put, the
 * detail is painted on top — see .recap in the CSS); «Скрыть» shrinks it back
 * into the card. The panel starts scaled onto the clicked card's box (FLIP) and
 * tweens to its natural full box, so the card itself appears to stretch — no
 * drop-down, no backdrop. Only one detail is ever open, and it covers the grid,
 * so a new card can only be opened from the collapsed state. */
function initEventCards(): void {
  const grid = document.querySelector<HTMLElement>('#event-cards');
  if (!grid) return;

  const details = Array.from(document.querySelectorAll<HTMLElement>('.event-detail'));
  const triggers = Array.from(grid.querySelectorAll<HTMLButtonElement>('[data-expand]'));
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const DURATION = 260; // ms — kept in sync with the inline transition below
  const EASE = 'cubic-bezier(.4, 0, .2, 1)';
  const transition = `transform ${DURATION}ms ${EASE}, opacity 140ms linear`;

  // The one card an open detail grew out of, so «Скрыть» can shrink back into it.
  let activeCard: HTMLElement | null = null;

  // Transform that shrinks `detail` onto `card`. With transform-origin: top-left
  // the two boxes line up corner-to-corner, so the panel visually *is* the card.
  const cardTransform = (detail: HTMLElement, card: HTMLElement): string => {
    const to = detail.getBoundingClientRect();
    const from = card.getBoundingClientRect();
    return `translate(${from.left - to.left}px, ${from.top - to.top}px) scale(${from.width / to.width}, ${from.height / to.height})`;
  };

  const open = (detail: HTMLElement, trigger: HTMLButtonElement): void => {
    const card = trigger.closest<HTMLElement>('.event-card');
    triggers.forEach((other) => other.setAttribute('aria-expanded', String(other === trigger)));
    detail.hidden = false;
    activeCard = card;

    if (reduceMotion || !card) {
      detail.style.transform = '';
      detail.style.opacity = '';
      return;
    }
    // start collapsed onto the card, then stretch out to the panel's full box
    detail.style.transition = 'none';
    detail.style.transform = cardTransform(detail, card);
    detail.style.opacity = '0';
    void detail.offsetWidth; // flush the start state so the tween runs
    detail.style.transition = transition;
    detail.style.transform = 'none';
    detail.style.opacity = '1';
  };

  const collapse = (): void => {
    triggers.forEach((trigger) => trigger.setAttribute('aria-expanded', 'false'));
    const card = activeCard;
    activeCard = null;

    details.forEach((detail) => {
      if (detail.hidden) return;
      if (reduceMotion || !card) {
        detail.hidden = true;
        return;
      }
      // reverse the stretch: shrink back into the card, then hide
      detail.style.transition = transition;
      detail.style.transform = cardTransform(detail, card);
      detail.style.opacity = '0';

      const onEnd = (event: TransitionEvent): void => {
        if (event.propertyName !== 'transform') return;
        detail.hidden = true;
        detail.style.transition = '';
        detail.style.transform = '';
        detail.style.opacity = '';
        detail.removeEventListener('transitionend', onEnd);
      };
      detail.addEventListener('transitionend', onEnd);
    });
  };

  triggers.forEach((trigger) => {
    const detail = document.querySelector<HTMLElement>(`#event-detail-${trigger.dataset.expand}`);
    if (!detail) return;

    trigger.addEventListener('click', (event) => {
      event.stopPropagation();
      open(detail, trigger);
    });
    // the whole card is clickable, the button is the accessible trigger
    trigger.closest('.event-card')?.addEventListener('click', () => open(detail, trigger));
  });

  document
    .querySelectorAll<HTMLButtonElement>('[data-collapse]')
    .forEach((button) => button.addEventListener('click', collapse));
}

/** Strongly-typed view of the join-form controls. */
interface JoinFormControls extends HTMLFormControlsCollection {
  name: HTMLInputElement;
  phone: HTMLInputElement;
  about: HTMLTextAreaElement;
}

// Vendored IMask (js/vendor/imask.min.js) exposes a global `IMask`.
interface MaskInstance {
  value: string;
  unmaskedValue: string;
  updateOptions(opts: Record<string, unknown>): void;
}
declare const IMask: (el: HTMLElement, opts: Record<string, unknown>) => MaskInstance;

/** Phone field: fixed "+7 (___) ___ __ __" mask. The `+7 (`, `)` and spaces are
 * locked (can't be deleted); the user only fills the 10 digit slots. Empty and
 * unfocused → the grey placeholder shows (lazy); the scaffold materialises on
 * focus. Returns the mask so the form can validate/reset it. */
function initPhoneMask(input: HTMLInputElement): MaskInstance {
  const mask = IMask(input, {
    mask: '+7 (000) 000 00 00',
    lazy: true, // show the grey placeholder attribute while empty
    placeholderChar: '_',
  });

  input.addEventListener('focus', () => mask.updateOptions({ lazy: false }));
  input.addEventListener('blur', () => {
    if (!mask.unmaskedValue) mask.updateOptions({ lazy: true });
  });

  // Paste / autofill: keep digits only, drop a leading 7/8 country code.
  const setFromRaw = (raw: string): void => {
    let digits = raw.replace(/\D/g, '');
    if (digits.length === 11 && (digits[0] === '7' || digits[0] === '8')) {
      digits = digits.slice(1);
    }
    mask.updateOptions({ lazy: false });
    mask.unmaskedValue = digits.slice(0, 10);
  };
  input.addEventListener('paste', (event: ClipboardEvent) => {
    event.preventDefault();
    setFromRaw(event.clipboardData?.getData('text') ?? '');
  });
  // Browser autofill fires input with no typed data — renormalise from the raw value.
  input.addEventListener('input', (event: Event) => {
    if ((event as InputEvent).inputType === 'insertReplacementText') {
      setFromRaw(input.value);
    }
  });

  return mask;
}

/** Join form: phone mask + POST to send.php, then the mockup's success / error
 * result states. Success is shown once the server confirms the lead is stored;
 * the server then forwards it to the Telegram recipients (best-effort). */
function initJoinForm(): void {
  const form = document.querySelector<HTMLFormElement>('#join-form');
  const okStatus = document.querySelector<HTMLElement>('#form-status-ok');
  const errorStatus = document.querySelector<HTMLElement>('#form-status-error');
  if (!form || !okStatus || !errorStatus) return;

  const controls = form.elements as JoinFormControls;
  const submit = form.querySelector<HTMLButtonElement>('.form__submit');
  const phoneMask = initPhoneMask(controls.phone);

  const showError = (): void => {
    okStatus.hidden = true;
    errorStatus.hidden = false;
  };

  // Any edit clears a lingering result message.
  form.addEventListener('input', () => {
    okStatus.hidden = true;
    errorStatus.hidden = true;
  });

  form.addEventListener('submit', async (event: SubmitEvent): Promise<void> => {
    event.preventDefault();

    const name = controls.name.value.trim();
    const phone = controls.phone.value.trim();
    const about = controls.about.value.trim();

    if (!name || phoneMask.unmaskedValue.length !== 10) {
      showError();
      return;
    }

    if (submit) submit.disabled = true;
    try {
      const response = await fetch('send.php', {
        method: 'POST',
        body: new URLSearchParams({ name, phone, about }),
      });
      const data = (await response.json().catch(() => null)) as { ok?: boolean } | null;
      if (response.ok && data?.ok) {
        errorStatus.hidden = true;
        okStatus.hidden = false;
        form.reset();
        phoneMask.value = ''; // sync the mask back to the placeholder state
        phoneMask.updateOptions({ lazy: true });
      } else {
        showError();
      }
    } catch {
      showError();
    } finally {
      if (submit) submit.disabled = false;
    }
  });
}

function init(): void {
  initIntro();
  initMarquee();
  initEventCards();
  initJoinForm();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

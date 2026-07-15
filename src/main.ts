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

/** Expandable past-event cards: clicking a card swaps the 3-card grid for that
 * event's wide gallery card; «Скрыть» swaps the grid back. */
function initEventCards(): void {
  const grid = document.querySelector<HTMLElement>('#event-cards');
  if (!grid) return;

  const details = Array.from(document.querySelectorAll<HTMLElement>('.event-detail'));
  const triggers = Array.from(grid.querySelectorAll<HTMLButtonElement>('[data-expand]'));

  const collapse = (): void => {
    details.forEach((detail) => (detail.hidden = true));
    triggers.forEach((trigger) => trigger.setAttribute('aria-expanded', 'false'));
    grid.hidden = false;
  };

  triggers.forEach((trigger) => {
    const detail = document.querySelector<HTMLElement>(`#event-detail-${trigger.dataset.expand}`);
    if (!detail) return;

    const expand = (): void => {
      details.forEach((other) => (other.hidden = other !== detail));
      triggers.forEach((other) => other.setAttribute('aria-expanded', String(other === trigger)));
      grid.hidden = true;
    };

    trigger.addEventListener('click', (event) => {
      event.stopPropagation();
      expand();
    });
    // the whole card is clickable, the button is the accessible trigger
    trigger.closest('.event-card')?.addEventListener('click', expand);
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

/** Live-format the phone field as "+7 (XXX) XXX XX XX" while typing. */
function initPhoneMask(input: HTMLInputElement): void {
  input.addEventListener('input', () => {
    let digits = input.value.replace(/\D/g, '');
    if (digits.startsWith('7') || digits.startsWith('8')) digits = digits.slice(1);
    digits = digits.slice(0, 10);

    if (!digits.length && !input.value.startsWith('+')) {
      input.value = '';
      return;
    }
    let out = '+7 (' + digits.slice(0, 3);
    if (digits.length >= 3) out += ') ' + digits.slice(3, 6);
    if (digits.length >= 6) out += ' ' + digits.slice(6, 8);
    if (digits.length >= 8) out += ' ' + digits.slice(8, 10);
    input.value = out;
  });
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
  initPhoneMask(controls.phone);

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

    if (!name || phone.replace(/\D/g, '').length < 11) {
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

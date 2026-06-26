// ============================================================
//  ПРОБУЖДЕНИЕ! — landing interactions
// ============================================================

// ----- Intro splash configuration -------------------------------------------
// The designer may still change these; each is a single switch.
const INTRO = {
  /** 'always' = every load · 'session' = once per tab session · 'device' = once ever */
  replay: 'always' as 'always' | 'session' | 'device',
  /** true → show the "enter" gate (a click is required for audio to play)
   *  false → autoplay muted with no gate */
  sound: true,
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

/** Duplicate the marquee content so the CSS `-50%` translate loops seamlessly. */
function initMarquee(): void {
  const track = document.querySelector<HTMLElement>('.marquee__track');
  if (!track) return;
  track.innerHTML += track.innerHTML;
}

/** Strongly-typed view of the join-form controls. */
interface JoinFormControls extends HTMLFormControlsCollection {
  name: HTMLInputElement;
  contact: HTMLInputElement;
  about: HTMLTextAreaElement;
}

function setStatus(el: HTMLElement, message: string, tone: 'ok' | 'error'): void {
  el.textContent = message;
  el.style.color = tone === 'ok' ? 'var(--lime)' : 'var(--orange)';
}

/** Client-side validation + friendly confirmation for the "join the family" form. */
function initJoinForm(): void {
  const form = document.querySelector<HTMLFormElement>('#join-form');
  const status = document.querySelector<HTMLElement>('#form-status');
  if (!form || !status) return;

  form.addEventListener('submit', (event: SubmitEvent): void => {
    event.preventDefault();

    const controls = form.elements as JoinFormControls;
    const name = controls.name.value.trim();
    const contact = controls.contact.value.trim();

    if (!name || !contact) {
      setStatus(status, 'Заполни имя и контакт — без них мы тебя не найдём.', 'error');
      return;
    }

    setStatus(status, `Готово, ${name}! Мы свяжемся с тобой. Добро пожаловать в семью \u{1F918}`, 'ok');
    form.reset();
  });
}

function init(): void {
  initIntro();
  initMarquee();
  initJoinForm();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

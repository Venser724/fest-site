// ============================================================
//  ПРОБУЖДЕНИЕ! — landing interactions
// ============================================================

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
  initMarquee();
  initJoinForm();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

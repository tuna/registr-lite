function switchToLanguage(lang) {
  const main = document.getElementsByTagName('main')[0];
  main.classList.remove('lang-en', 'lang-zh');
  main.classList.add(`lang-${lang}`);

  const inputs = document.getElementsByTagName('input');
  for (const input of inputs) {
    const newPh = input.getAttribute(`data-ph-${lang}`);
    if (newPh) {
      input.setAttribute('placeholder', newPh);
    }
  }
}

const STEPS = ['email', 'nickname', 'extra', 'success'];
let curStep = 'email';

async function submit() {
  const email = document.querySelector('input[name=email]').value.trim();
  const nickname = document.querySelector('input[name=nickname]').value.trim();
  const dept = document.querySelector('input[name=dept]').value.trim();
  const studentId = document.querySelector('input[name=studentId]').value.trim();

  const payload = { email, nickname, dept: dept === '' ? undefined : dept, studentId: studentId === '' ? undefined : studentId };
  const resp = await fetch('/api/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (resp.status === 204) return true;

  // Error handling
  document.querySelectorAll('.error').forEach(el => el.classList.remove('shown'));
  if (resp.status === 400) {
    document.querySelector('.error.error-invalid').classList.add('shown');
  } else if (resp.status === 409) {
    document.querySelector('.error.error-dup').classList.add('shown');
  }
  return false;
}

async function step() {
  // Submit if at extra
  if (curStep === 'extra') {
    const result = await submit();
    if (!result) {
      curStep = 'email';
      switchFrame();
      return;
    }
  }

  // Check consistency: if there is invalid inputs in the current frame
  const invalidInput = document.querySelector(`.frame.shown input:invalid`);
  if (invalidInput) {
    invalidInput.focus();
    return;
  }

  const curIdx = STEPS.indexOf(curStep);
  curStep = STEPS[(curIdx + 1)];
  switchFrame();
}

function switchFrame() {
  const shownFrame = document.querySelector(`.frame.shown`);
  if (shownFrame) {
    shownFrame.classList.remove('shown');
    shownFrame.animate({
      opacity: [1, 0],
      transform: ['translateX(0)', 'translateX(-20px)']
    }, {
      duration: 200,
      fill: 'forwards',
      timing: 'ease-in',
    });
  }

  const newFrame = document.querySelector(`.frame#${curStep}-frame`);
  newFrame.classList.add('shown');
  newFrame.animate({
    opacity: [0, 1],
    transform: ['translateX(20px)', 'translateX(0)']
  }, {
    duration: 200,
    delay: 100,
    fill: 'forwards',
    timing: 'ease-out',
  });

  // Focus first input
  const firstInput = newFrame.querySelector('input');
  if (firstInput)
    firstInput.focus();
}

function bootstrap() {
  // Detect browser language
  const lang = navigator.language.startsWith('zh') ? 'zh' : 'en';
  switchToLanguage(lang);

  // Language switcher
  const langBtns = document.querySelectorAll('.language-list button');
  for (const btn of langBtns) {
    btn.addEventListener('click', () => {
      const selectedLang = btn.getAttribute('data-lang');
      switchToLanguage(selectedLang);
    });
  }

  // Next
  const nextBtns = document.querySelectorAll('.next-inner');
  for (const btn of nextBtns) {
    btn.addEventListener('click', () => {
      step();
    });
  }

  // Input enters
  const inputs = document.querySelectorAll('input');
  for (const input of inputs) {
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        // Check if this is the last input in the frame
        const frame = input.closest('.frame');
        const frameInputs = frame.querySelectorAll('input');
        // Finx index
        const inputIdx = Array.from(frameInputs).indexOf(input);
        if (inputIdx === frameInputs.length - 1) {
          step();
        } else {
          frameInputs[inputIdx + 1].focus();
        }
      }
    });
  }

  // Init
  const main = document.getElementsByTagName('main')[0];
  main.style.display = null;
  main.classList.add('init');

  // Show initial frame
  switchFrame();
}

document.addEventListener('DOMContentLoaded', bootstrap);

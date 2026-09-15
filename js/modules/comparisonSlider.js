// img-comparison-slider: dono exclusivo do divisor antes/depois (mouse, toque e teclado).
// GSAP só revela o <figure> que o contém; Motion só anima o botão "Ver imagens ampliadas".
// O CSS da biblioteca não é importado: ele esconde o componente até o JS carregar,
// e o nosso (css/style.css) mantém a imagem visível sem JavaScript.
import 'img-comparison-slider';

const STEP = 5;
const PAGE_STEP = 10;

/**
 * Completa a acessibilidade que o componente não expõe (papel e valor do slider) e troca o
 * teclado "enquanto a tecla estiver pressionada" da biblioteca por passos previsíveis:
 * setas ±5%, PageUp/PageDown ±10%, Home/End 0% e 100%. Quem move o divisor continua sendo
 * o componente, pela sua própria API `value`.
 */
export function initComparisonSliders(root = document) {
  const sliders = [...root.querySelectorAll('[data-comparison-slider]')];
  const cleanups = sliders.map(slider => {
    const sync = () => {
      const value = Math.round(Number(slider.value));
      slider.setAttribute('aria-valuenow', String(value));
      // value = posição do divisor: à esquerda dele aparece o "antes".
      slider.setAttribute('aria-valuetext', `${value}% antes, ${100 - value}% depois`);
    };

    const onKeyDown = event => {
      const current = Number(slider.value);
      const next = {
        ArrowLeft: current - STEP,
        ArrowDown: current - STEP,
        ArrowRight: current + STEP,
        ArrowUp: current + STEP,
        PageDown: current - PAGE_STEP,
        PageUp: current + PAGE_STEP,
        Home: 0,
        End: 100,
      }[event.key];
      if (next === undefined) return;
      event.preventDefault(); // setas não rolam a página enquanto o slider tem foco
      slider.value = Math.min(100, Math.max(0, next));
      sync();
    };

    // keyboard="disabled" vem no HTML gerado: o componente só lê esse atributo ao ser registrado.
    slider.setAttribute('role', 'slider');
    slider.setAttribute('aria-orientation', 'horizontal');
    slider.setAttribute('aria-valuemin', '0');
    slider.setAttribute('aria-valuemax', '100');
    sync();
    slider.addEventListener('slide', sync);
    slider.addEventListener('keydown', onKeyDown);
    return () => {
      slider.removeEventListener('slide', sync);
      slider.removeEventListener('keydown', onKeyDown);
    };
  });
  return { destroy: () => cleanups.forEach(fn => fn()) };
}
